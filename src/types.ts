export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
  duration: number;
  source: 'demo' | 'netease' | 'itunes' | 'local';
  url?: string;
  channel?: string;
  preview?: boolean;
}
export interface TrackResponse { tracks: Track[]; provider: string; notice?: string; }
