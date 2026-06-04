// =============================================
// CCT · supabase.js
// 이 파일에 본인의 Supabase 프로젝트 정보를 넣으세요
// =============================================

const SUPABASE_URL = 'YOUR_SUPABASE_URL';       // 예: https://abcdefg.supabase.co
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'; // Supabase 대시보드 > Settings > API

const { createClient } = supabase;
window._supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
