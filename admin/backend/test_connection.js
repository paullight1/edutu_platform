import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Testing connection to:', supabaseUrl);
console.log('Key length:', supabaseKey ? supabaseKey.length : 0);

if (!supabaseUrl || !supabaseKey) {
    console.error('Credentials missing in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    try {
        console.log('Fetching from opportunities...');
        const { data, error } = await supabase.from('opportunities').select('id').limit(1);
        if (error) {
            console.error('Error:', error.message);
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
