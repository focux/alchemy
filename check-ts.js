const { execSync } = require('child_process');

try {
  execSync('bun tsc -b', { stdio: 'inherit' });
  console.log('TypeScript compilation succeeded!');
} catch (error) {
  console.error('TypeScript compilation failed');
  process.exit(1);
}