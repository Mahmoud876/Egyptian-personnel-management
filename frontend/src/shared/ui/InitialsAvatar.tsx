import Avatar from '@mui/material/Avatar';
import { tokens } from './tokens';

/** First letters of the first two names ("طارق عبد الرحمن" -> "طع"). Avatars are the only round shapes. */
export function initials(name: string): string {
  const words = name.replace(/^(أ|م|د|ل)\.\s*/, '').trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('');
}

export function InitialsAvatar({ name, size = 32, soft = false }: { name: string; size?: number; soft?: boolean }) {
  return (
    <Avatar
      aria-hidden
      sx={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        fontWeight: 600,
        bgcolor: soft ? tokens.secondaryContainer : tokens.primary,
        color: soft ? tokens.primary : '#ffffff',
      }}
    >
      {initials(name)}
    </Avatar>
  );
}
