
import { createClient } from 'https://esm.sh/@supabase/supabase-js@^2.45.0';

const supabaseUrl = 'https://mdnzpfazuufmbllqtnlz.supabase.co';
const supabaseKey = 'sb_publishable_9PDaod4SZtOXURkoJuS6iQ_SkeCZ4nV';

export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * SQL FOR RLS FIXES (Run in Supabase SQL Editor if data is hidden/not saving):
 * 
 * -- Enable RLS for all lesson tables
 * ALTER TABLE public.lessons_programming ENABLE ROW LEVEL SECURITY;
 * -- (Repeat for all discipline tables: lessons_ai, lessons_cyber_security, etc.)
 * 
 * -- Create basic policies
 * CREATE POLICY "Public can view published lessons" ON public.lessons_programming
 *   FOR SELECT USING (status = 'PUBLISHED');
 * 
 * CREATE POLICY "Admins can do everything" ON public.lessons_programming
 *   TO authenticated
 *   USING ( (SELECT role FROM profiles WHERE id = auth.uid()) = 'ADMIN' );
 * 
 * -- STORAGE REQUIREMENTS:
 * -- Create a PUBLIC bucket named 'identity_documents' in Supabase Storage.
 * -- CREATE POLICY "Public Document Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'identity_documents');
 * -- CREATE POLICY "Public Document View" ON storage.objects FOR SELECT USING (bucket_id = 'identity_documents');
 */
