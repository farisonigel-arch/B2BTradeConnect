import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  supabase,
  type Session,
} from '@/lib/supabase';

type AccountType =
  | 'individual'
  | 'business'
  | 'regulator';

type AuthMode = 'signin' | 'signup';

type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  account_type: AccountType;
};

type Business = {
  id: string;
  business_name: string;
  registration_number: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  country: string;
  verification_status:
    | 'pending'
    | 'verified'
    | 'rejected'
    | 'suspended';
};

type TradeCategory = {
  id: string;
  name: string;
  description: string | null;
};

export default function HomeScreen() {
  const [session, setSession] =
    useState<Session | null>(null);

  const [profile, setProfile] =
    useState<Profile | null>(null);

  const [business, setBusiness] = useState<Business | null>(null);
  const [businessLoading, setBusinessLoading] = useState(false);

  const [tradeCategories, setTradeCategories] = useState<
    TradeCategory[]
  >([]);

  const [selectedTradeCategories, setSelectedTradeCategories] =
    useState<string[]>([]);

  function toggleTradeCategory(categoryId: string) {
    setSelectedTradeCategories((current) => {
      if (current.includes(categoryId)) {
        return current.filter((id) => id !== categoryId);
      }

      return [...current, categoryId];
    });
  }

  async function saveTradeCategories() {
    if (!business) {
      return;
    }

    if (selectedTradeCategories.length === 0) {
      Alert.alert(
        'Select a trade area',
        'Please select at least one trade category.'
      );
      return;
    }

    setSavingTradeCategories(true);

    try {
      const { error: deleteError } =
        await supabase
          .from('business_trade_categories')
          .delete()
          .eq('business_id', business.id);

      if (deleteError) {
        throw deleteError;
      }

      const rows = selectedTradeCategories.map(
        (categoryId, index) => ({
          business_id: business.id,
          trade_category_id: categoryId,
          is_primary: index === 0,
          approved: false,
        })
      );

      const { error: insertError } =
        await supabase
          .from('business_trade_categories')
          .insert(rows);

      if (insertError) {
        throw insertError;
      }

      Alert.alert(
        'Trade areas saved',
        'Your business trade areas have been updated.'
      );
    } catch (error) {
      console.error(
        'Failed to save trade categories:',
        error
      );

      Alert.alert(
        'Unable to save',
        'The trade areas could not be saved. Please try again.'
      );
    } finally {
      setSavingTradeCategories(false);
    }
  }

  const [tradeCategoriesLoading, setTradeCategoriesLoading] =
    useState(false);

  const [savingTradeCategories, setSavingTradeCategories] =
    useState(false);
  
  const [loading, setLoading] = useState(true);

  const [authMode, setAuthMode] =
    useState<AuthMode>('signin');

  const [accountType, setAccountType] =
    useState<AccountType>('individual');

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [businessName, setBusinessName] =
    useState('');
  const [registrationNumber, setRegistrationNumber] =
    useState('');
  const [businessPhone, setBusinessPhone] =
    useState('');
  const [businessAddress, setBusinessAddress] =
    useState('');
  const [businessCity, setBusinessCity] =
    useState('Harare');

  const [submitting, setSubmitting] =
    useState(false);

  useEffect(() => {
    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      async (_event, currentSession) => {
        setSession(currentSession);

        if (currentSession) {
          const loadedProfile =
            await loadProfile(currentSession);

          if (loadedProfile) {
            if (
              loadedProfile.account_type === 'business'
            ) {
              await ensureBusinessProfile(
                currentSession,
                loadedProfile
              );
            } else {
              await loadBusiness(
                currentSession,
                loadedProfile
              );
            }
          }
        } else {
          setProfile(null);
          setBusiness(null);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function loadSession() {
    try {
      await loadTradeCategories();
      
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      setSession(currentSession);

      if (currentSession) {
        const loadedProfile =
          await loadProfile(currentSession);

        if (loadedProfile) {
          if (
            loadedProfile.account_type === 'business'
          ) {
            await ensureBusinessProfile(
              currentSession,
              loadedProfile
            );
          } else {
            await loadBusiness(
              currentSession,
              loadedProfile
            );
          }
        }
      }
    } catch (error) {
      console.error(
        'Failed to load session:',
        error
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadProfile(
    currentSession: Session
  ): Promise<Profile | null> {
    const { data, error } =
      await supabase
        .from('profiles')
        .select(
          'id, email, full_name, phone, account_type'
        )
        .eq('id', currentSession.user.id)
        .single();

    if (error) {
      console.error(
        'Failed to load profile:',
        error
      );

      return null;
    }

    const loadedProfile =
      data as Profile;

    setProfile(loadedProfile);

    return loadedProfile;
  }
  
  async function ensureBusinessProfile(
  currentSession: Session,
  currentProfile: Profile
) {
  if (currentProfile.account_type !== 'business') {
    return;
  }

  setBusinessLoading(true);

  try {
    // First check whether the business profile already exists.
    const {
      data: existingBusiness,
      error: existingBusinessError,
    } = await supabase
      .from('business_entities')
      .select(
        `
        id,
        business_name,
        registration_number,
        phone,
        email,
        address,
        city,
        country,
        verification_status
        `
      )
      .eq('owner_id', currentSession.user.id)
      .maybeSingle();

    if (existingBusinessError) {
      console.error(
        'Failed to check business profile:',
        existingBusinessError
      );
      return;
    }

    // Business already exists.
    if (existingBusiness) {
      setBusiness(existingBusiness as Business);

      await loadSelectedTradeCategories(
        existingBusiness.id
      );

      return;
    }

    // Business does not exist yet.
    // Retrieve the information saved during signup.
    const metadata = currentSession.user.user_metadata;

    const businessName =
      metadata?.business_name?.trim();

    const registrationNumber =
      metadata?.registration_number?.trim();

    const businessPhone =
      metadata?.business_phone?.trim() ?? '';

    const businessAddress =
      metadata?.business_address?.trim() ?? '';

    const businessCity =
      metadata?.business_city?.trim() ?? '';

    if (!businessName || !registrationNumber) {
      console.warn(
        'Business account does not contain the required business signup information.'
      );
      return;
    }

    const { data: businessId, error: createError } =
      await supabase.rpc(
        'create_business_profile',
        {
          p_business_name: businessName,
          p_registration_number: registrationNumber,
          p_phone: businessPhone,
          p_address: businessAddress,
          p_city: businessCity,
          p_country: 'Zimbabwe',
        }
      );

    if (createError) {
      console.error(
        'Failed to create business profile:',
        createError
      );
      return;
    }

    console.log(
      'Business profile created:',
      businessId
    );

    // Load the newly-created business.
    const {
      data: createdBusiness,
      error: reloadError,
    } = await supabase
      .from('business_entities')
      .select(
        `
        id,
        business_name,
        registration_number,
        phone,
        email,
        address,
        city,
        country,
        verification_status
        `
      )
      .eq('owner_id', currentSession.user.id)
      .maybeSingle();

    if (reloadError) {
      console.error(
        'Failed to reload business profile:',
        reloadError
      );
      return;
    }

    setBusiness(
      createdBusiness as Business | null
    );

    if (createdBusiness) {
      await loadSelectedTradeCategories(
        createdBusiness.id
      );
    }
    
  } finally {
    setBusinessLoading(false);
  }
}

async function loadTradeCategories() {
  setTradeCategoriesLoading(true);

  try {
    const { data, error } = await supabase
      .from('trade_categories')
      .select('id, name, description')
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error(
        'Failed to load trade categories:',
        error
      );
      return;
    }

    setTradeCategories(
      (data ?? []) as TradeCategory[]
    );
  } finally {
    setTradeCategoriesLoading(false);
  }
}

async function loadSelectedTradeCategories(
  businessId: string
) {
  const { data, error } = await supabase
    .from('business_trade_categories')
    .select('trade_category_id')
    .eq('business_id', businessId);

  if (error) {
    console.error(
      'Failed to load selected trade categories:',
      error
    );
    return;
  }

  setSelectedTradeCategories(
    (data ?? []).map(
      (item) => item.trade_category_id
    )
  );
}

  async function loadBusiness(
    currentSession: Session,
    currentProfile: Profile
  ) {
    if (
      currentProfile.account_type !== 'business'
    ) {
      setBusiness(null);
      return;
    }

    setBusinessLoading(true);

    try {
      const { data, error } =
        await supabase
          .from('business_entities')
          .select(
            `
            id,
            business_name,
            registration_number,
            phone,
            email,
            address,
            city,
            country,
            verification_status
            `
          )
          .eq(
            'owner_id',
            currentSession.user.id
          )
          .maybeSingle();

      if (error) {
        console.error(
          'Failed to load business:',
          error
        );
        return;
      }

      setBusiness(data as Business | null);
      
      if (data) {
        await loadSelectedTradeCategories(data.id);
      } else {
        setSelectedTradeCategories([]);
      }
    } finally {
      setBusinessLoading(false);
    }
  }

  async function handleSignUp() {
    if (
      !fullName.trim() ||
      !email.trim() ||
      !password.trim()
    ) {
      Alert.alert(
        'Missing information',
        'Please complete your name, email and password.'
      );
      return;
    }

    if (
      accountType === 'business' &&
      (
        !businessName.trim() ||
        !registrationNumber.trim() ||
        !businessPhone.trim() ||
        !businessAddress.trim() ||
        !businessCity.trim()
      )
    ) {
      Alert.alert(
        'Missing business information',
        'Please complete all business fields.'
      );
      return;
    }

    if (password.length < 6) {
      Alert.alert(
        'Password too short',
        'Your password must contain at least 6 characters.'
      );
      return;
    }

    try {
      setSubmitting(true);

      const { data, error } =
        await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              account_type: accountType,

              ...(accountType === 'business'
                ? {
                    business_name:
                      businessName.trim(),
                    registration_number:
                      registrationNumber.trim(),
                    business_phone:
                      businessPhone.trim(),
                    business_address:
                      businessAddress.trim(),
                    business_city:
                      businessCity.trim(),
                  }
                : {}),
            },
          },
        });

      if (error) {
        Alert.alert(
          'Registration failed',
          error.message
        );
        return;
      }

      if (data.session) {
        Alert.alert(
          'Account created',
          'Your account has been created and you are now signed in.'
        );
      } else {
        Alert.alert(
          'Check your email',
          'Your account has been created. Please confirm your email address, then sign in.'
        );
      }

      clearForm();
      setAuthMode('signin');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred.';

      Alert.alert(
        'Registration failed',
        message
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignIn() {
    if (!email.trim() || !password.trim()) {
      Alert.alert(
        'Missing information',
        'Please enter your email and password.'
      );
      return;
    }

    try {
      setSubmitting(true);

      const { error } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (error) {
        Alert.alert(
          'Sign in failed',
          error.message
        );
        return;
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred.';

      Alert.alert(
        'Sign in failed',
        message
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignOut() {
    try {
      setSubmitting(true);

      const { error } =
        await supabase.auth.signOut();

      if (error) {
        Alert.alert(
          'Sign out failed',
          error.message
        );
        return;
      }

      setProfile(null);
      clearForm();
      setAuthMode('signin');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred.';

      Alert.alert(
        'Sign out failed',
        message
      );
    } finally {
      setSubmitting(false);
    }
  }

  function clearForm() {
    setFullName('');
    setEmail('');
    setPassword('');
    setBusinessName('');
    setRegistrationNumber('');
    setBusinessPhone('');
    setBusinessAddress('');
    setBusinessCity('Harare');
    setAccountType('individual');
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />

        <Text style={styles.loadingText}>
          Loading B2B Trade Connect...
        </Text>
      </View>
    );
  }

  if (session) {
    return (
      <Dashboard
        session={session}
        profile={profile}
        business={business}
        businessLoading={businessLoading}
        tradeCategories={tradeCategories}
        selectedTradeCategories={selectedTradeCategories}
        tradeCategoriesLoading={tradeCategoriesLoading}
        savingTradeCategories={savingTradeCategories}
        onToggleTradeCategory={toggleTradeCategory}
        onSaveTradeCategories={saveTradeCategories}
        onSignOut={handleSignOut}
        submitting={submitting}
      />
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={
        Platform.OS === 'ios'
          ? 'padding'
          : undefined
      }
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>
          B2B Trade Connect
        </Text>

        <Text style={styles.subtitle}>
          {authMode === 'signin'
            ? 'Sign in to your account'
            : 'Create your account'}
        </Text>

        <View style={styles.modeContainer}>
          <Pressable
            style={[
              styles.modeButton,
              authMode === 'signin' &&
                styles.modeButtonActive,
            ]}
            onPress={() =>
              setAuthMode('signin')
            }
          >
            <Text
              style={[
                styles.modeButtonText,
                authMode === 'signin' &&
                  styles.modeButtonTextActive,
              ]}
            >
              Sign In
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.modeButton,
              authMode === 'signup' &&
                styles.modeButtonActive,
            ]}
            onPress={() =>
              setAuthMode('signup')
            }
          >
            <Text
              style={[
                styles.modeButtonText,
                authMode === 'signup' &&
                  styles.modeButtonTextActive,
              ]}
            >
              Create Account
            </Text>
          </Pressable>
        </View>

        {authMode === 'signup' && (
          <>
            <Text style={styles.sectionTitle}>
              Account type
            </Text>

            <AccountTypeButton
              title="Individual"
              description="For individual professionals and service providers"
              selected={
                accountType === 'individual'
              }
              onPress={() =>
                setAccountType('individual')
              }
            />

            <AccountTypeButton
              title="Business"
              description="For registered businesses and organizations"
              selected={
                accountType === 'business'
              }
              onPress={() =>
                setAccountType('business')
              }
            />

            <AccountTypeButton
              title="Regulatory Authority"
              description="For authorized regulatory organizations"
              selected={
                accountType === 'regulator'
              }
              onPress={() =>
                setAccountType('regulator')
              }
            />

            {accountType === 'regulator' && (
              <Text style={styles.warning}>
                Regulatory access requires verification.
                Selecting this option does not grant
                regulatory privileges.
              </Text>
            )}

            <Text style={styles.sectionTitle}>
              Personal information
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Full name"
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
            />
          </>
        )}

        <TextInput
          style={styles.input}
          placeholder="Email address"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />

        {authMode === 'signup' &&
          accountType === 'business' && (
            <>
              <Text style={styles.sectionTitle}>
                Business information
              </Text>

              <TextInput
                style={styles.input}
                placeholder="Business name"
                value={businessName}
                onChangeText={setBusinessName}
                autoCapitalize="words"
              />

              <TextInput
                style={styles.input}
                placeholder="Business registration number"
                value={registrationNumber}
                onChangeText={
                  setRegistrationNumber
                }
                autoCapitalize="characters"
              />

              <TextInput
                style={styles.input}
                placeholder="Business phone number"
                value={businessPhone}
                onChangeText={setBusinessPhone}
                keyboardType="phone-pad"
              />

              <TextInput
                style={styles.input}
                placeholder="Business address"
                value={businessAddress}
                onChangeText={setBusinessAddress}
                multiline
              />

              <TextInput
                style={styles.input}
                placeholder="City"
                value={businessCity}
                onChangeText={setBusinessCity}
                autoCapitalize="words"
              />
            </>
          )}

        <Pressable
          style={[
            styles.button,
            submitting &&
              styles.buttonDisabled,
          ]}
          onPress={
            authMode === 'signin'
              ? handleSignIn
              : handleSignUp
          }
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>
              {authMode === 'signin'
                ? 'Sign In'
                : 'Create Account'}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Dashboard({
  session,
  profile,
  business,
  businessLoading,
  tradeCategories,
  selectedTradeCategories,
  tradeCategoriesLoading,
  savingTradeCategories,
  onToggleTradeCategory,
  onSaveTradeCategories,
  onSignOut,
  submitting,
}: {
  session: Session;
  profile: Profile | null;
  business: Business | null;
  businessLoading: boolean;

  tradeCategories: TradeCategory[];
  selectedTradeCategories: string[];
  tradeCategoriesLoading: boolean;
  savingTradeCategories: boolean;

  onToggleTradeCategory: (
    categoryId: string
  ) => void;

  onSaveTradeCategories: () => Promise<void>;

  onSignOut: () => void;
  submitting: boolean;
}) {
  const [activeScreen, setActiveScreen] = useState<
  | 'dashboard'
  | 'business'
  | 'trade'
  | 'documents'
  | 'regulatory'
  | 'tenders'
>('dashboard');

  const accountLabel =
    profile?.account_type === 'business'
      ? 'Business'
      : profile?.account_type === 'regulator'
        ? 'Regulatory Authority'
        : 'Individual';

  const screenDetails = {
    business: {
      title: 'Business Profile',
      description:
        'Review your business registration, location and verification status.',
    },
    trade: {
      title: 'Trade & Business',
      description:
        'Manage trade areas, skills, business activities and transactions.',
    },
    documents: {
      title: 'Documents',
      description:
        'Your certificate and contract management area.',
    },
    regulatory: {
      title: 'Regulatory Updates',
      description:
        'Your regulatory requirements and official notices.',
    },
    tenders: {
      title: 'Tenders',
      description:
        'Find tender opportunities and manage bids.',
    },
  };

  if (activeScreen !== 'dashboard') {
    const details = screenDetails[activeScreen];

    return (
      <ScrollView
        contentContainerStyle={styles.dashboardContent}
      >
        <Pressable
          onPress={() => setActiveScreen('dashboard')}
          accessibilityRole="button"
          style={{ marginBottom: 20 }}
        >
          <Text style={styles.linkText}>
            ← Back to Dashboard
          </Text>
        </Pressable>

        <Text style={styles.dashboardTitle}>
          {details.title}
        </Text>

        <Text style={styles.featureText}>
          {details.description}
        </Text>

        {activeScreen === 'business' && (
          <View style={styles.featureCard}>
            <Text style={styles.cardTitle}>
              Business Information
            </Text>

            {business ? (
              <>
                <Text style={styles.value}>
                  {business.business_name}
                </Text>
                <Text style={styles.value}>
                  Registration: {business.registration_number}
                </Text>
                <Text style={styles.value}>
                  Location: {business.city}, {business.country}
                </Text>
                <Text style={styles.value}>
                  Status: {business.verification_status}
                </Text>
              </>
            ) : (
              <Text style={styles.featureText}>
                {businessLoading
                  ? 'Loading business profile…'
                  : 'No business profile has been created yet.'}
              </Text>
            )}
          </View>
        )}

        {activeScreen === 'trade' && (
          <View style={styles.featureCard}>
            <Text style={styles.cardTitle}>
              Trade Areas
            </Text>

            {tradeCategories.map((category) => {
              const selected =
                selectedTradeCategories.includes(category.id);

              return (
                <Pressable
                  key={category.id}
                  onPress={() =>
                    onToggleTradeCategory(category.id)
                  }
                  style={{
                    padding: 12,
                    marginBottom: 8,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: selected ? '#007AFF' : '#DDDDDD',
                    backgroundColor: selected ? '#F0F7FF' : '#FFFFFF',
                  }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                >
                  <Text>
                    {selected ? '☑' : '☐'} {category.name}
                  </Text>
                  {category.description ? (
                    <Text style={styles.featureText}>
                      {category.description}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}

            {tradeCategoriesLoading && (
              <ActivityIndicator />
            )}

            <Pressable
              style={styles.button}
              onPress={onSaveTradeCategories}
              disabled={
                savingTradeCategories ||
                tradeCategoriesLoading
              }
            >
              {savingTradeCategories ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>
                  Save Trade Areas
                </Text>
              )}
            </Pressable>
          </View>
        )}

        {activeScreen === 'documents' && (
          <View style={styles.featureCard}>
            <Text style={styles.featureText}>
              Document uploads and secure storage will be implemented next.
            </Text>
          </View>
        )}

        {activeScreen === 'regulatory' && (
          <View style={styles.featureCard}>
            <Text style={styles.featureText}>
              Regulatory updates will be connected to Supabase next.
            </Text>
          </View>
        )}

        {activeScreen === 'tenders' && (
          <View style={styles.featureCard}>
            <Text style={styles.featureText}>
              Tender listings and bid submissions will be implemented next.
            </Text>
          </View>
        )}

        <Pressable
          style={styles.button}
          onPress={() => setActiveScreen('dashboard')}
        >
          <Text style={styles.buttonText}>
            Back to Dashboard
          </Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={
        styles.dashboardContent
      }
    >
      <Text style={styles.dashboardTitle}>
        B2B Trade Connect
      </Text>

      <Text style={styles.dashboardSubtitle}>
        Dashboard
      </Text>

      <View style={styles.profileCard}>
        <Text style={styles.cardTitle}>
          Your Account
        </Text>

        <Text style={styles.label}>
          Name
        </Text>

        <Text style={styles.value}>
          {profile?.full_name || 'Not provided'}
        </Text>

        <Text style={styles.label}>
          Email
        </Text>

        <Text style={styles.value}>
          {profile?.email ||
            session.user.email ||
            'Not available'}
        </Text>

        <Text style={styles.label}>
          Account type
        </Text>

        <Text style={styles.value}>
          {accountLabel}
        </Text>

        {profile?.account_type ===
          'regulator' && (
          <Text style={styles.warning}>
            Regulatory privileges require separate
            authorization.
          </Text>
        )}
      </View>

      {profile?.account_type === 'business' && (
        <Pressable
          style={styles.featureCard}
          onPress={() => setActiveScreen('business')}
          accessibilityRole="button"
        >
          <Text style={styles.cardTitle}>
            Business Profile
          </Text>

          {businessLoading ? (
            <ActivityIndicator />
          ) : business ? (
            <>
              <Text style={styles.label}>
                Business name
              </Text>

              <Text style={styles.value}>
                {business.business_name}
              </Text>

              <Text style={styles.label}>
                Registration number
              </Text>

              <Text style={styles.value}>
                {business.registration_number}
              </Text>

              <Text style={styles.label}>
                Location
              </Text>

              <Text style={styles.value}>
                {business.city}, {business.country}
              </Text>

              <Text style={styles.label}>
                Verification status
              </Text>

              <Text style={styles.value}>
                {business.verification_status}
              </Text>
            </>
          ) : (
            <Text style={styles.featureText}>
              Your business profile has not been created
              yet.
            </Text>
          )}
        </Pressable>
      )}

      <Pressable
        style={styles.featureCard}
        onPress={() => setActiveScreen('trade')}
        accessibilityRole="button"
      >
        <Text style={styles.cardTitle}>
          Trade & Business
        </Text>
        <Text style={styles.featureText}>
          Manage trade categories, skills, tenders and transactions.
        </Text>
        <Text style={styles.linkText}>
          Open Trade & Business →
        </Text>
      </Pressable>

      <Pressable
        style={styles.featureCard}
        onPress={() => setActiveScreen('documents')}
        accessibilityRole="button"
      >
        <Text style={styles.cardTitle}>
          Documents
        </Text>
        <Text style={styles.featureText}>
          Manage certificates and contracts with owner-controlled visibility.
        </Text>
        <Text style={styles.linkText}>
          Open Documents →
        </Text>
      </Pressable>

      <Pressable
        style={styles.featureCard}
        onPress={() => setActiveScreen('regulatory')}
        accessibilityRole="button"
      >
        <Text style={styles.cardTitle}>
          Regulatory Updates
        </Text>
        <Text style={styles.featureText}>
          View regulatory requirements and official updates.
        </Text>
        <Text style={styles.linkText}>
          Open Regulatory Updates →
        </Text>
      </Pressable>

      <Pressable
        style={styles.featureCard}
        onPress={() => setActiveScreen('tenders')}
        accessibilityRole="button"
      >
        <Text style={styles.cardTitle}>
          Tenders
        </Text>
        <Text style={styles.featureText}>
          Explore tender opportunities and manage bids.
        </Text>
        <Text style={styles.linkText}>
          Open Tenders →
        </Text>
      </Pressable>

      <Pressable
        style={[
          styles.button,
          submitting &&
            styles.buttonDisabled,
        ]}
        onPress={onSignOut}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.buttonText}>
            Sign Out
          </Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

type AccountTypeButtonProps = {
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
};

function AccountTypeButton({
  title,
  description,
  selected,
  onPress,
}: AccountTypeButtonProps) {
  return (
    <Pressable
      style={[
        styles.accountTypeButton,
        selected &&
          styles.accountTypeButtonSelected,
      ]}
      onPress={onPress}
    >
      <View style={styles.radioOuter}>
        {selected && (
          <View style={styles.radioInner} />
        )}
      </View>

      <View style={styles.accountTypeText}>
        <Text style={styles.accountTypeTitle}>
          {title}
        </Text>

        <Text style={styles.accountTypeDescription}>
          {description}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },

  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },

  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },

  title: {
    fontSize: 30,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },

  subtitle: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 24,
  },

  modeContainer: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#dddddd',
    borderRadius: 10,
    marginBottom: 24,
    overflow: 'hidden',
  },

  modeButton: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },

  modeButtonActive: {
    backgroundColor: '#007AFF',
  },

  modeButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#555555',
  },

  modeButtonTextActive: {
    color: '#ffffff',
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
    marginTop: 4,
  },

  accountTypeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cccccc',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },

  accountTypeButtonSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#F0F7FF',
  },

  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#777777',
    alignItems: 'center',
    justifyContent: 'center',
  },

  radioInner: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#007AFF',
  },

  accountTypeText: {
    flex: 1,
    marginLeft: 12,
  },

  accountTypeTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 3,
  },

  accountTypeDescription: {
    fontSize: 13,
    color: '#666666',
    lineHeight: 18,
  },

  warning: {
    fontSize: 13,
    color: '#8A5A00',
    backgroundColor: '#FFF7E6',
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
  },

  input: {
    borderWidth: 1,
    borderColor: '#cccccc',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 12,
  },

  button: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 12,
    minHeight: 50,
    justifyContent: 'center',
  },

  buttonDisabled: {
    opacity: 0.6,
  },

  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },

  dashboardContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 50,
    backgroundColor: '#F7F9FC',
  },

  dashboardTitle: {
    fontSize: 30,
    fontWeight: '700',
    marginBottom: 4,
  },

  dashboardSubtitle: {
    fontSize: 18,
    color: '#666666',
    marginBottom: 24,
  },

  profileCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#eeeeee',
  },

  featureCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#eeeeee',
  },

  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 14,
  },

  label: {
    fontSize: 13,
    color: '#777777',
    marginTop: 8,
  },

  value: {
    fontSize: 16,
    marginTop: 3,
  },

  featureText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#555555',
  },

  linkText: {
    color: '#007AFF',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 10,
  },
});