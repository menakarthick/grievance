'use strict';

const smsProvider = require('./sms.provider');
const emailProvider = require('./email.provider');
const whatsappProvider = require('./whatsapp.provider');
const pushProvider = require('./push.provider');
const inAppProvider = require('./inApp.provider');

// Maps a dispatch `channel` value (08-Notification-APIs.md §8.1.2) to its
// adapter. push_mobile/push_web/push_browser share one FCM/OneSignal-
// abstracted adapter per §8.5's "one pipeline, not three"; voice_call/ivrs
// are reserved Future channel values with no adapter (callers get
// NOT_ENABLED before ever reaching this registry).
const CHANNEL_PROVIDERS = {
  sms: smsProvider,
  email: emailProvider,
  whatsapp: whatsappProvider,
  push_mobile: pushProvider,
  push_web: pushProvider,
  push_browser: pushProvider,
  in_app: inAppProvider,
};

// Maps a provider_config.providerType value (§8.12's four notification-
// scoped types) to the same adapters, for the provider connectivity-test
// endpoint.
const PROVIDER_TYPE_ADAPTERS = {
  sms: smsProvider,
  email: emailProvider,
  whatsapp: whatsappProvider,
  push: pushProvider,
};

function getChannelProvider(channel) {
  return CHANNEL_PROVIDERS[channel] || null;
}

function getProviderTypeAdapter(providerType) {
  return PROVIDER_TYPE_ADAPTERS[providerType] || null;
}

module.exports = { CHANNEL_PROVIDERS, PROVIDER_TYPE_ADAPTERS, getChannelProvider, getProviderTypeAdapter };
