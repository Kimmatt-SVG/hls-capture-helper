const { getActiveProfile, buildSearchUrl } = require("./site-profiles");

const profile = getActiveProfile();

const SITE_HOME_URL = profile.homeUrl;
const SITE_BASE_URL = profile.baseUrl;
const SITE_LOGIN_URL = profile.loginUrl;

module.exports = {
  SITE_HOME_URL,
  SITE_BASE_URL,
  SITE_LOGIN_URL,
  buildSearchUrl,
  getSiteProfile: () => profile
};
