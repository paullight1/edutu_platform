import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://sioxocmrjmdevsdlzjns.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpb3hvY21yam1kZXZzZGx6am5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1OTU5MzksImV4cCI6MjA3NzE3MTkzOX0.q__hzhcra0rbY1cB92JIG4fUUA4YtTEi4GjUgDz_3d0';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testSignup() {
    try {
        console.log('Testing SignUp from Node...');
        const { data, error } = await supabase.auth.signUp({
            email: 'test-signup-node-' + Date.now() + '@edutu.com',
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
