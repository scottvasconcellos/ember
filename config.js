// Ember configuration.
//
// Both values below are filled in by you, once. See REFERENCES.md → "Setup you
// must do". Until then the app runs LOCAL-ONLY: the check-in works and saves to this
// device, and the course stays empty because it lives in the backend.
//
// A Google client ID is public by design. There is no client secret in this flow.
// Never put anything else secret in this file — it is served publicly.

window.EMBER_CONFIG = {
  appId: 'ember',

  // A. Apps Script Web App URL, ends in /exec
  endpoint: 'https://script.google.com/macros/s/AKfycbwFo7g1CFiYxDbFXKnBgO9-W2IyyOEyqUmVLrIuGt8rgyPb77Z7SC02pzushK7gkytzBg/exec',

  // B. OAuth Web application client ID, ends in .apps.googleusercontent.com
  clientId: 'PASTE_YOUR_CLIENT_ID',

  // Days in the course
  days: 60,
};
