import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../services/db';
import { AppPreferences, Preferences } from '../types';

interface SettingsContextType {
    prefs: AppPreferences;
    preferences: Preferences;
    isFeatureEnabled: (featureId: string) => boolean;
    applyFeature: (featureId: string) => Promise<void>;
    rejectFeature: (featureId: string) => Promise<void>;
    toggleFeature: (featureId: string) => Promise<void>;
    refreshPrefs: () => Promise<void>;
    updateCurrentUser: (user: { personDocumentId: string; name: string } | undefined) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [prefs, setPrefs] = useState<AppPreferences>({ appliedImprovements: [], rejectedImprovements: [] });
    const [preferences, setPreferences] = useState<Preferences>({});

    useEffect(() => {
        refreshPrefs();
    }, []);

    const refreshPrefs = async () => {
        const p = await db.getAppPreferences();
        setPrefs(p);
        const generalPrefs = await db.getPreferences();
        setPreferences(generalPrefs);
    };

    const isFeatureEnabled = (featureId: string) => {
        // If enabledImprovements is defined, check it. Otherwise fallback to applied (backward compat)
        if (prefs.enabledImprovements) {
            return prefs.enabledImprovements.includes(featureId);
        }
        return prefs.appliedImprovements.includes(featureId);
    };

    const applyFeature = async (featureId: string) => {
        const newPrefs = { ...prefs };
        // Remove from rejected if it was there
        newPrefs.rejectedImprovements = newPrefs.rejectedImprovements.filter(id => id !== featureId);

        // Add to applied if not present
        if (!newPrefs.appliedImprovements.includes(featureId)) {
            newPrefs.appliedImprovements.push(featureId);
        }

        // Enable by default when applied
        if (!newPrefs.enabledImprovements) newPrefs.enabledImprovements = [];
        if (!newPrefs.enabledImprovements.includes(featureId)) {
            newPrefs.enabledImprovements.push(featureId);
        }

        await db.saveAppPreferences(newPrefs);
        setPrefs(newPrefs);
    };

    const rejectFeature = async (featureId: string) => {
        const newPrefs = { ...prefs };
        // Remove from applied if it was there
        newPrefs.appliedImprovements = newPrefs.appliedImprovements.filter(id => id !== featureId);

        // Remove from enabled
        if (newPrefs.enabledImprovements) {
            newPrefs.enabledImprovements = newPrefs.enabledImprovements.filter(id => id !== featureId);
        }

        // Add to rejected if not present
        if (!newPrefs.rejectedImprovements.includes(featureId)) {
            newPrefs.rejectedImprovements.push(featureId);
        }
        await db.saveAppPreferences(newPrefs);
        setPrefs(newPrefs);
    };

    const toggleFeature = async (featureId: string) => {
        const newPrefs = { ...prefs };
        if (!newPrefs.enabledImprovements) newPrefs.enabledImprovements = [...newPrefs.appliedImprovements];

        if (newPrefs.enabledImprovements.includes(featureId)) {
            newPrefs.enabledImprovements = newPrefs.enabledImprovements.filter(id => id !== featureId);
        } else {
            newPrefs.enabledImprovements.push(featureId);
        }
        await db.saveAppPreferences(newPrefs);
        setPrefs(newPrefs);
    };

    const updateCurrentUser = async (user: { personDocumentId: string; name: string } | undefined) => {
        const newPreferences = { ...preferences, currentUser: user };
        await db.savePreferences(newPreferences);
        setPreferences(newPreferences);
    };

    return (
        <SettingsContext.Provider value={{ prefs, preferences, isFeatureEnabled, applyFeature, rejectFeature, toggleFeature, refreshPrefs, updateCurrentUser }}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};
