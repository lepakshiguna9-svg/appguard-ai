import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({mode})=>{const env=loadEnv(mode,process.cwd(),'APPGUARD_');return {plugins:[react()],server:{proxy:{'/api':env.APPGUARD_API_TARGET||'http://127.0.0.1:8000'}}}});
