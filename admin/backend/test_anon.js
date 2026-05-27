import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Set SUPABASE_URL and SUPABASE_ANON_KEY before running this test.');
}

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
