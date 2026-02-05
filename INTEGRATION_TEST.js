// ========================================
// RING-0 INTEGRATION TEST SCRIPT
// Run this in browser console (F12) to verify integration
// ========================================

async function runIntegrationTests() {
  console.log('🚀 Starting RING-0 Integration Tests...\n');
  
  // Test 1: Supabase Client
  console.log('📋 TEST 1: Supabase Client Initialization');
  if (supabaseClient) {
    console.log('✅ supabaseClient is initialized');
  } else {
    console.error('❌ supabaseClient is NULL');
    return;
  }
  
  // Test 2: Database Connection
  console.log('\n📋 TEST 2: Database Connection');
  try {
    const { data, error } = await supabaseClient
      .from('registration_fields')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('❌ Database query failed:', error);
      return;
    }
    console.log('✅ Database connection successful');
  } catch (e) {
    console.error('❌ Error:', e);
    return;
  }
  
  // Test 3: Load User Management Data
  console.log('\n📋 TEST 3: Load User Management Data');
  await fetchUserManagementData();
  
  // Test 4: Check Registration Fields
  console.log('\n📋 TEST 4: Check Registration Fields');
  const fields = JSON.parse(localStorage.getItem('ring0_data_framework') || '[]');
  if (fields.length > 0) {
    console.log(`✅ Found ${fields.length} registration fields:`);
    fields.forEach(f => {
      const normalizedField = normalizeField(f);
      console.log(`  • ${normalizedField.name} (${normalizedField.type}, required: ${normalizedField.required})`);
    });
  } else {
    console.warn('⚠️ No registration fields found');
  }
  
  // Test 5: Check Users
  console.log('\n📋 TEST 5: Check Users in Database');
  try {
    const { data: users, error } = await supabaseClient
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('❌ Error fetching users:', error);
    } else if (users && users.length > 0) {
      console.log(`✅ Found ${users.length} users in database:`);
      users.slice(0, 3).forEach(u => {
        console.log(`  • ${u.full_name} (${u.registration_number})`);
      });
    } else {
      console.log('✅ Database is empty (no users yet)');
    }
  } catch (e) {
    console.error('❌ Error:', e);
  }
  
  // Test 6: Check Data Normalization
  console.log('\n📋 TEST 6: Test Data Normalization');
  const testField = {
    field_name: 'Full Name',
    field_type: 'text',
    is_required: true,
    field_order: 1
  };
  const normalized = normalizeField(testField);
  if (normalized && normalized.name === 'Full Name' && normalized.type === 'text') {
    console.log('✅ Field normalization working');
    console.log('  Input:', testField);
    console.log('  Output:', normalized);
  } else {
    console.error('❌ Field normalization failed');
  }
  
  // Test 7: Test Registration Form
  console.log('\n📋 TEST 7: Test Registration Form');
  const framework = JSON.parse(localStorage.getItem('ring0_data_framework') || '[]');
  if (framework.length > 0) {
    console.log('✅ Registration form can be generated from fields');
    console.log('  Total fields available:', framework.length);
  } else {
    console.warn('⚠️ No fields available for form generation');
  }
  
  // Test 8: Test Duplicate Prevention
  console.log('\n📋 TEST 8: Test Duplicate Prevention');
  console.log('ℹ️ To test: Register a user twice with same registration_number');
  console.log('   Expected: Second registration should be rejected');
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ INTEGRATION TESTS COMPLETED');
  console.log('='.repeat(50));
  console.log('\nNext steps:');
  console.log('1. Click "member sign up" button');
  console.log('2. Fill all fields with test data');
  console.log('3. Click Submit');
  console.log('4. Check Supabase Dashboard → Data Editor → users table');
  console.log('5. Verify new user appears with correct data');
}

// Quick test for registration submission
async function testRegistration() {
  console.log('🧪 Testing Registration Submission...\n');
  
  const testUser = {
    full_name: 'Test User',
    registration_number: 'TEST' + Date.now(),
    phone_number: '+1234567890',
    email: 'test@example.com',
    status: 'active',
    created_at: new Date().toISOString()
  };
  
  console.log('📤 Submitting test user:', testUser);
  
  try {
    const { data, error } = await supabaseClient
      .from('users')
      .insert([testUser])
      .select();
    
    if (error) {
      console.error('❌ Error:', error);
      return false;
    }
    
    console.log('✅ User saved successfully:', data);
    return true;
  } catch (e) {
    console.error('❌ Error:', e);
    return false;
  }
}

// Show system status
function showSystemStatus() {
  console.log('='.repeat(50));
  console.log('RING-0 SYSTEM STATUS');
  console.log('='.repeat(50));
  
  // Supabase
  console.log('\n📊 Supabase:');
  console.log(`  Client: ${supabaseClient ? '✅ Initialized' : '❌ Not initialized'}`);
  
  // Data
  console.log('\n📊 Data in localStorage:');
  const fields = JSON.parse(localStorage.getItem('ring0_data_framework') || '[]');
  const users = JSON.parse(localStorage.getItem('ring0_user_data') || '[]');
  const groups = JSON.parse(localStorage.getItem('ring0_user_groups') || '[]');
  
  console.log(`  Registration Fields: ${fields.length} items`);
  console.log(`  Users: ${users.length} items`);
  console.log(`  Groups: ${groups.length} items`);
  
  // Functions
  console.log('\n📊 Available Functions:');
  console.log(`  normalizeField: ${typeof normalizeField === 'function' ? '✅' : '❌'}`);
  console.log(`  normalizeDataFramework: ${typeof normalizeDataFramework === 'function' ? '✅' : '❌'}`);
  console.log(`  fetchUserManagementData: ${typeof fetchUserManagementData === 'function' ? '✅' : '❌'}`);
  console.log(`  submitMemberRegistration: ${typeof submitMemberRegistration === 'function' ? '✅' : '❌'}`);
  console.log(`  populateUserTable: ${typeof populateUserTable === 'function' ? '✅' : '❌'}`);
  
  console.log('\n' + '='.repeat(50));
}

// Run all tests
console.log('\n\n');
console.log('╔════════════════════════════════════════════════╗');
console.log('║    RING-0 INTEGRATION TEST SUITE LOADED       ║');
console.log('╚════════════════════════════════════════════════╝');
console.log('\nAvailable commands:');
console.log('  • runIntegrationTests() - Run full test suite');
console.log('  • testRegistration() - Test user registration');
console.log('  • showSystemStatus() - Show system status');
console.log('\nExample:');
console.log('  > await runIntegrationTests()');
console.log('  > await testRegistration()');
console.log('  > showSystemStatus()');
console.log('\n');

// Auto-show status on load
showSystemStatus();
