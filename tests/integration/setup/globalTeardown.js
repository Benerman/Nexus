module.exports = async function globalTeardown() {
  const pid = process.env.__INTEGRATION_SERVER_PID__;

  if (pid) {
    console.log(`Killing server process (PID: ${pid})...`);
    try {
      process.kill(Number(pid), 'SIGTERM');
      // Give it a moment to shut down gracefully
      await new Promise(r => setTimeout(r, 1000));
      try {
        process.kill(Number(pid), 'SIGKILL');
      } catch {
        // Already dead, that's fine
      }
    } catch (err) {
      if (err.code !== 'ESRCH') {
        console.error('Error killing server process:', err);
      }
    }
  }
};
