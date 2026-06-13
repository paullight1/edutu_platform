import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://sioxocmrjmdevsdlzjns.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpb3hvY21yam1kZXZzZGx6am5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1OTU5MzksImV4cCI6MjA3NzE3MTkzOX0.q__hzhcra0rbY1cB92JIG4fUUA4YtTEi4GjUgDz_3d0';

console.log('Testing ANON connection to:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    try {
        console.log('Fetching from opportunities (public)...');
        const { data, error } = await supabase.from('opportunities').select('id').limit(1);
        if (error) {
            console.log('Error Code:', error.code);
            console.log('Error Message:', error.message);
            console.log('RESULT: FAIL');
        } else {
            console.log('RESULT: SUCCESS');
            console.log('Data found:', data.length);
        }
    } catch (err) {
        console.error('Exception:', err.message);
        console.log('RESULT: EXCEPTION');
    }
}

test();
