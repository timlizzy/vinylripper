import { getAlbumMetadata } from './src/musicbrainz.js';

const artist = 'Hüsker Dü';
const album = 'Candy Apple Grey';

console.log(`Testing: ${artist} - ${album}`);

try {
  const result = await getAlbumMetadata(artist, album);
  console.log('\nResult:');
  console.log('- Release:', result.release);
  console.log('- Tracks:', result.tracks?.length);
  console.log('\nLog:');
  result.log.forEach(entry => {
    const icon = entry.type === 'success' ? '✓' : entry.type === 'error' ? '✗' : entry.type === 'warning' ? '⚠' : 'ℹ';
    console.log(`  ${icon} ${entry.message}`);
  });
} catch (error) {
  console.error('Error:', error.message);
  if (error.log) {
    console.log('\nLog from error:');
    error.log.forEach(entry => console.log(`  - ${entry.message}`));
  }
}
