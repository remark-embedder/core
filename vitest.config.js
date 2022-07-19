/// <reference types="vitest" />
/// <reference types="vite/client" />

module.exports = {
  test: {
    include: ['**/__tests__/**.ts'],
    environment: 'node',
  },
}
