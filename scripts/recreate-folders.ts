#!/usr/bin/env node

/**
 * Script to recreate the Nexus Drive folder structure
 * Run this after accidentally deleting the system folders
 */

import { driveService } from './services/driveService';
import { authService } from './services/authService';

async function recreateNexusStructure() {
    console.log('🔧 Recreating Nexus Drive folder structure...');

    // Check if user is authenticated
    const token = authService.getAccessToken();
    if (!token) {
        console.error('❌ Not authenticated. Please login first.');
        process.exit(1);
    }

    try {
        // Initialize drive service (creates Nexus folder and type folders)
        await driveService.initialize();

        console.log('✅ Nexus Drive folder structure recreated successfully!');
        console.log('📁 Created folders:');
        console.log('   - Nexus (root folder)');
        console.log('   - Pages');
        console.log('   - Persons');
        console.log('   - Meetings');
        console.log('   - Projects');
        console.log('   - Graph Views');

        console.log('\n✨ You can now use NexusDrive normally.');
    } catch (error) {
        console.error('❌ Failed to recreate folder structure:', error);
        process.exit(1);
    }
}

recreateNexusStructure();
