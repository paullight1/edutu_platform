import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Set SUPABASE_URL and SUPABASE_ANON_KEY before running this test.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testSignup() {
    try {
        console.log('Testing SignUp from Node...');
        const { data, error } = await supabase.auth.signUp({
            email: 'test-signup-node-' + Date.now() + '@edutu.org',
            password: 'Password123!'
        });

        if (error) {
            console.log('Error:', error.message);
        } else {
            console.log('Success! User:', data.user?.email);
        }
    } catch (err) {
        console.error('Exception:', err.message);
    }
}

testSignup();
