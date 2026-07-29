# Background music

Drop a licensed track here as `bg-music.mp3` (subtle/ambient works best — it
plays under the whole video at low volume, not as a featured element).

`render.ts` checks whether this file exists before each render; if it's
missing, videos render silently (no code changes needed either way). Once
you add the file, every subsequent render automatically includes it, looped
and faded in/out.

Any royalty-free track cleared for use in a produced video works (e.g.
Pixabay Music or YouTube Audio Library — check the specific track's license
permits commercial/redistributed use, which most of theirs do without
attribution). Don't commit a track you don't have the rights to use.
