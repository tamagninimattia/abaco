// Configurazione Supabase
// Sostituisci questi due valori con quelli del tuo progetto Supabase
// (Project Settings > API)

const SUPABASE_URL = 'https://cewaolsvhhmlsxbzwgde.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNld2FvbHN2aGhtbHN4Ynp3Z2RlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0ODIxMTMsImV4cCI6MjEwNTA1ODExM30.LPRW4GfzO9d-YC0Z57GEgLCIVxrQCFUdAW9lFMwQ6u8';

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
