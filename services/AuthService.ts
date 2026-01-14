import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { CryptoService } from './CryptoService';
import type { LockType, IntruderSettings } from '../types';

const SALT_KEY = 'vault_salt';
const VERIFIER_REAL = 'vault_verifier_real';
const VERIFIER_DECOY = 'vault_verifier_decoy';
const TYPE_KEY = 'vault_lock_type';
const BIO_ENABLED_KEY = 'vault_bio_enabled';
const INTRUDER_CONFIG_KEY = 'vault_intruder_config';

export class AuthService {
    static async isInitialized(): Promise<boolean> {
        const { value } = await Preferences.get({ key: VERIFIER_REAL });
        return !!value;
    }

    static async getSalt(): Promise<string | null> {
        const { value } = await Preferences.get({ key: SALT_KEY });
        return value;
    }

    static async initializeVault(password: string, type: LockType): Promise<{ salt: string }> {
        const salt = await CryptoService.generateSalt();
        const verifier = await CryptoService.hashForVerification(password, salt);
        
        await Preferences.set({ key: SALT_KEY, value: salt });
        await Preferences.set({ key: VERIFIER_REAL, value: verifier });
        await Preferences.set({ key: TYPE_KEY, value: type });
        
        return { salt };
    }

    static async verifyCredentials(password: string): Promise<{ success: boolean; mode?: 'REAL' | 'DECOY'; salt?: string }> {
        const salt = await this.getSalt();
        const realRes = await Preferences.get({ key: VERIFIER_REAL });
        const decoyRes = await Preferences.get({ key: VERIFIER_DECOY });
        
        if (!salt || !realRes.value) throw new Error("Vault corrupted or not initialized");

        const inputHash = await CryptoService.hashForVerification(password, salt);

        if (inputHash === realRes.value) {
            return { success: true, mode: 'REAL', salt };
        } else if (decoyRes.value && inputHash === decoyRes.value) {
            return { success: true, mode: 'DECOY', salt };
        }
        
        return { success: false };
    }

    static async getLockType(): Promise<LockType> {
        const { value } = await Preferences.get({ key: TYPE_KEY });
        return (value as LockType) || 'PASSWORD';
    }

    static async updateCredentials(newSalt: string, newVerifier: string, newType: LockType) {
        await Preferences.set({ key: SALT_KEY, value: newSalt });
        await Preferences.set({ key: VERIFIER_REAL, value: newVerifier });
        await Preferences.set({ key: TYPE_KEY, value: newType });
        
        // Wipe Decoy when master changes (security policy)
        await Preferences.remove({ key: VERIFIER_DECOY });
    }

    static async setDecoyCredential(password: string, salt: string) {
        const verifier = await CryptoService.hashForVerification(password, salt);
        await Preferences.set({ key: VERIFIER_DECOY, value: verifier });
    }

    static async removeDecoyCredential() {
        await Preferences.remove({ key: VERIFIER_DECOY });
    }

    static async hasDecoy(): Promise<boolean> {
        const { value } = await Preferences.get({ key: VERIFIER_DECOY });
        return !!value;
    }

    // --- Biometrics ---
    static async checkBiometricAvailability(): Promise<boolean> {
        // Restrict biometrics to native platform (Android/iOS) only
        if (!Capacitor.isNativePlatform()) {
            return false;
        }

        if (window.PublicKeyCredential) {
            return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        }
        return false;
    }

    static async getBiometricEnabled(): Promise<boolean> {
        const { value } = await Preferences.get({ key: BIO_ENABLED_KEY });
        return value === 'true';
    }

    static async setBiometricEnabled(enabled: boolean) {
        await Preferences.set({ key: BIO_ENABLED_KEY, value: String(enabled) });
    }

    static async authenticateBiometric(): Promise<boolean> {
        try {
            if (!window.PublicKeyCredential) return false;
            
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);

            await navigator.credentials.create({
                publicKey: {
                challenge,
                rp: { name: "SecureVault Local" },
                user: {
                    id: new Uint8Array(16),
                    name: "user",
                    displayName: "Vault Owner"
                },
                pubKeyCredParams: [{ alg: -7, type: "public-key" }],
                authenticatorSelection: { authenticatorAttachment: "platform" },
                timeout: 60000,
                attestation: "direct"
                }
            });
            return true;
        } catch (e) {
            return false;
        }
    }

    // --- Intruder ---
    static async getIntruderSettings(): Promise<IntruderSettings> {
        const { value } = await Preferences.get({ key: INTRUDER_CONFIG_KEY });
        if (value) {
            return JSON.parse(value) as IntruderSettings;
        }
        return { enabled: false, photoCount: 1, source: 'FRONT' };
    }

    static async setIntruderSettings(settings: IntruderSettings) {
        await Preferences.set({ key: INTRUDER_CONFIG_KEY, value: JSON.stringify(settings) });
    }

    static async wipeAll() {
        await Preferences.clear();
    }
}