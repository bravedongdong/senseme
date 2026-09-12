import { createMusicHandler } from '../server/music-api.js';

// Reuse the same routes on Vercel without opening a listening socket.
export default createMusicHandler();
