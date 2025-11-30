import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../services/db';
import { AppPreferences } from '../types';

interface SettingsContextType {
    prefs: AppPreferences;
    isFeatureEnabled: (featureId: string) => boolean;
    applyFeature: (featureId: string) => Promise<void>;
    rejectFeature: (featureId: string) => Promise<void>;
    refreshPrefs: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [prefs, setPrefs] = useState<AppPreferences>({ appliedImprovements: [], rejectedImprovements: [] });

    useEffect(() => {
        refreshPrefs();
    }, []);

    const refreshPrefs = async () => {
        const p = await db.getAppPreferences();
        setPrefs(p);
    };

    const isFeatureEnabled = (featureId: string) => {
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
        await db.saveAppPreferences(newPrefs);
        setPrefs(newPrefs);
    };

    const rejectFeature = async (featureId: string) => {
        const newPrefs = { ...prefs };
        // Remove from applied if it was there
        newPrefs.appliedImprovements = newPrefs.appliedImprovements.filter(id => id !== featureId);
        // Add to rejected if not present
        if (!newPrefs.rejectedImprovements.includes(featureId)) {
            newPrefs.rejectedImprovements.push(featureId);
        }
        await db.saveAppPreferences(newPrefs);
        setPrefs(newPrefs);
    };

    return (
        <SettingsContext.Provider value={{ prefs, isFeatureEnabled, applyFeature, rejectFeature, refreshPrefs }}>
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
