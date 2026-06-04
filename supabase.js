// =============================================
// CCT · supabase.js
// 이 파일에 본인의 Supabase 프로젝트 정보를 넣으세요
// =============================================

const SUPABASE_URL = ' https://zuodnwysgnhrvjgnyaak.supabase.co';       // 예: https://abcdefg.supabase.co
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1b2Rud3lzZ25ocnZqZ255YWFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NjgwMTMsImV4cCI6MjA5NjE0NDAxM30.hfs_ssW9cpCpySfAPwOTsTPBt8D2iCHkOQ7P0EtJf4E'; // Supabase 대시보드 > Settings > API

const { createClient } = supabase;
window._supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
