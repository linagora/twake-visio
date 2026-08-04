source "https://rubygems.org"

# fastlane pilote les publications signées : iOS (match + gym + pilot) et
# Android (gradle + firebase_app_distribution + supply).
# Le runbook est dans docs/ci-cd-signed-release.md.
gem "fastlane", "~> 2.225"

plugins_path = File.join(File.dirname(__FILE__), "fastlane", "Pluginfile")
eval_gemfile(plugins_path) if File.exist?(plugins_path)
