# Gogodex — Data Protection Notice

**Last updated:** May 11, 2026

This Data Protection Notice explains how the Gogodex mobile application ("App", "Gogodex", "we", "us", or "our") handles information when you use it to control a Codex runtime running on your paired computer.

Gogodex is a fork of the open-source Remodex project. This notice describes the Gogodex app and related services operated for this fork. It does not describe services operated by the original Remodex author.

---

## 1. Overview

Gogodex is designed as a local-first companion for Codex:

- Your conversations, repository actions, and workspace operations are primarily processed on your paired computer.
- We do not operate Gogodex user accounts or a cloud chat-history database.
- We do not run advertising, cross-app tracking, or behavioral ad profiling.
- We do not sell your personal information.
- After the secure session is established, messages between your iPhone and paired computer are end-to-end encrypted.
- The App may use a hosted relay to help your iPhone reach your paired computer.

## 2. Information We Collect

### 2.1 Information You Provide Through the App

- **Chat messages and prompts** — Your messages are sent from the iPhone to your paired computer for processing. After the secure transport handshake is complete, the relay forwards encrypted payloads and cannot read message contents.
- **Photo attachments** — Images you attach from the camera or photo library are sent to your paired computer over the secure channel.
- **Voice recordings** — When you use voice mode, the App records a temporary audio file on your iPhone and may send that audio to OpenAI/ChatGPT for transcription. The request is authenticated through the paired computer session when available.
- **Git and workspace operations** — Commands you initiate from the App, such as commit, pull, push, branch, or status actions, are executed on your paired computer.

### 2.2 Information Collected Automatically

- **Pairing and identity keys** — The App generates cryptographic identity material used for secure pairing and trusted reconnect.
- **Relay and trusted-device metadata** — The App stores relay session data, trusted computer identifiers, and reconnect metadata needed to restore a secure connection.
- **Subscription and purchase state** — If subscriptions are enabled in a distributed build, Apple and RevenueCat may be used to determine entitlement status.
- **Connection metadata** — If you use a hosted relay, the relay may process network and session metadata needed to route traffic, maintain trusted reconnect, and operate the service.

### 2.3 Information We Do Not Collect for Analytics or Advertising

- We do **not** collect advertising profiles.
- We do **not** use third-party advertising SDKs.
- We do **not** track you across other companies' apps or websites.
- We do **not** require your name, phone number, or email address to use the App.

If you contact us directly, we receive whatever information you choose to include in that message.

## 3. How We Use Information

We use information only to operate and secure Gogodex, including:

- pairing your iPhone with your computer
- routing encrypted traffic between your iPhone and paired computer
- performing trusted reconnect
- checking and restoring subscription entitlements when enabled
- transcribing voice input when you explicitly use voice mode
- maintaining app security, stability, and abuse prevention for hosted infrastructure

We do not use your information for advertising, profiling, or resale.

## 4. Services That Process Data

### 4.1 Gogodex Hosted Relay Infrastructure

The App can use hosted relay infrastructure for:

- routing traffic between your iPhone and paired computer
- trusted reconnect resolution

This infrastructure may process:

- session identifiers and trusted-device metadata
- connection metadata such as IP address, timestamps, and route-level request data
- secure control messages needed to establish the encrypted session

Once the secure session is active, the hosted relay does **not** decrypt Gogodex application payloads.

### 4.2 OpenAI / ChatGPT

When you use voice mode or other features that require OpenAI/ChatGPT services, relevant requests may be sent to OpenAI/ChatGPT.

- Privacy policy: [openai.com/privacy](https://openai.com/privacy)

### 4.3 RevenueCat

If subscriptions are enabled in your build, RevenueCat may be used for subscription and entitlement management. RevenueCat may process an anonymous app user identifier, entitlement status, purchase information, device/app metadata, and subscription management URLs.

- Privacy policy: [www.revenuecat.com/privacy](https://www.revenuecat.com/privacy)

### 4.4 Apple

Apple provides App Store billing, subscriptions, iOS permissions, and platform services used by the App.

- Privacy policy: [apple.com/privacy](https://www.apple.com/privacy/)

## 5. Data Storage and Security

### 5.1 On Your iPhone

- **Keychain** — sensitive values such as identity keys, pairing state, relay credentials, and encryption keys
- **Encrypted message cache** — chat history may be stored locally in encrypted form using a Keychain-backed key
- **UserDefaults** — non-sensitive preferences and interface settings
- **Temporary files** — voice recordings are stored temporarily during capture/transcription

### 5.2 On Your Computer

Your paired computer runs the local bridge and Codex runtime. Chat handling, git operations, and workspace actions are performed there.

### 5.3 On Hosted Relay Infrastructure

When the hosted relay is used, server-side components may keep limited operational state such as active session state and trusted reconnect metadata needed to route traffic and restore a secure connection.

### 5.4 In Transit

- The iPhone and paired computer establish an end-to-end encrypted session.
- The relay can observe connection metadata and secure-session setup traffic, but not encrypted application payloads after the secure session is established.
- Voice transcription and subscription requests are sent over HTTPS/TLS.

## 6. Data Retention

- **Chat history on iPhone** — stored locally until the app's local storage is removed.
- **Voice recordings** — temporary voice files are deleted by the app after transcription completes or fails.
- **Pairing and trusted-device state** — retained in local app storage and Keychain until removed by app actions or platform behavior.
- **Subscription records** — retained by Apple and RevenueCat according to their own policies.

We do not maintain a cloud chat history database for your message contents.

## 7. Your Choices

- You can revoke camera, microphone, photo library, and local network permissions at any time in iOS Settings.
- You can manage or cancel subscriptions through Apple account settings when subscriptions are enabled.
- Deleting the app removes ordinary app-container files. Keychain items are managed by iOS separately and may persist differently, including across reinstall scenarios.

## 8. Privacy Rights

Depending on your jurisdiction, you may have rights to access, correct, delete, restrict, or object to the processing of personal information, and to request portability where applicable.

Because Gogodex is primarily local-first, much of your data remains under your direct control on your devices. We do not maintain a centralized cloud chat database. Some data may be processed or retained by Apple, RevenueCat, OpenAI, and hosted relay infrastructure according to their own operational needs and policies.

## 9. Children's Privacy

The App is not directed to children under 13, or the minimum age required by local law. We do not knowingly collect personal information from children.

## 10. International Transfers

Depending on where you use the App and where service providers or hosted infrastructure are located, data processed by OpenAI, RevenueCat, Apple, or the hosted relay may be handled outside your country of residence.

## 11. Open-Source Attribution

Gogodex is based on Remodex by Emanuele Di Pietro / Emanuele-web04, licensed under the Apache License 2.0. Source-code use remains governed by the applicable repository license and attribution notices.

Original project: [github.com/Emanuele-web04/remodex](https://github.com/Emanuele-web04/remodex)

## 12. Changes to This Policy

We may update this Data Protection Notice from time to time. When we do, we will update the "Last updated" date above.

## 13. Contact

If you have questions about this Data Protection Notice or want to exercise your privacy rights, you can reach us at:

- **Email:** tonywei49@gmail.com
- **GitHub:** [github.com/tonywei49/cod-mobile](https://github.com/tonywei49/cod-mobile)
