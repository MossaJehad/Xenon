// Shared config for `web-ext` (Firefox + Chrome packaging).
// Keeps the build to just the files the extension actually loads, so AMO/CWS
// don't flag the marketing pages, prompt notes, or the multi-MB source images.
module.exports = {
	ignoreFiles: [
		// website / marketing pages — not part of the extension
		"index.html",
		"donate/**",
		"settings/**",
		"assets/css/**",
		"assets/images/favicon.png",
		"assets/images/xenon-icon.png",
		"assets/images/xenon_owl.png",
		// repo / tooling files
		"attached_assets/**",
		".env",
		".env.*",
		"*.env",
		".replit",
		"web-ext-config.cjs",
		"package.json",
		"package-lock.json",
		"node_modules/**",
		"web-ext-artifacts/**",
		"*.md",
	],
};
