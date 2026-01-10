/**
 * Universal Sync Manager for RING-0 Lost & Found System
 * Hybrid synchronization approach with multiple fallback mechanisms
 * Designed to achieve 99.9% reliability and <500ms latency
 */

class PropertySyncManager {
    constructor() {
        // Configuration
        this.SYNC_CHANNEL = 'ring0-property-sync';
        this.STORAGE_KEY = 'ring0_properties';
        this.LAST_UPDATE_KEY = 'ring0_last_update';
        this.ADMIN_ONLINE_KEY = 'ring0_admin_online';
        this.SYNC_STATUS_KEY = 'ring0_sync_status';
        this.OFFLINE_QUEUE_KEY = 'ring0_offline_queue';
        this.POLLING_INTERVAL = 5000; // 5 seconds max polling interval
        this.MAX_RETRIES = 5;
        this.RETRY_BASE_DELAY = 100; // ms

        // State
        this.broadcastChannel = null;
        this.isPrimarySync = false;
        this.isAdminPanel = false;
        this.syncStatus = 'initializing';
        this.pendingChanges = new Map();
        this.offlineQueue = [];
        this.retryCount = 0;
        this.pollingIntervalId = null;
        this.lastKnownUpdate = 0;
        this.syncMetrics = {
            successfulSyncs: 0,
            failedSyncs: 0,
            lastSyncTime: 0,
            lastSyncDuration: 0,
            consecutiveFailures: 0
        };

        // Initialize
        this.init();
    }

    /**
     * Initialize the sync manager
     */
    init() {
        // Detect if this is admin panel
        this.isAdminPanel = window.location.pathname.includes('lost_properties.html');

        // Set up sync status monitoring
        this.updateSyncStatus('initializing');

        // Try to establish primary sync (BroadcastChannel)
        this.setupBroadcastChannel();

        // Set up storage event listeners
        this.setupStorageListeners();

        // Set up custom event listeners for same-tab
        this.setupCustomEvents();

        // Load initial data
        this.loadInitialData();

        // Set up periodic sync
        this.setupPeriodicSync();

        // Set up offline queue processing
        this.setupOfflineQueue();

        // Set up visibility change listener
        this.setupVisibilityListener();

        // Set up beforeunload handler
        this.setupBeforeUnload();

        // Check for admin online status
        if (!this.isAdminPanel) {
            this.checkAdminOnlineStatus();
        }

        // Log initialization
        this.logSyncEvent('SyncManager initialized', 'info');
        this.updateSyncStatus('ready');
    }

    /**
     * Set up BroadcastChannel for primary real-time sync
     */
    setupBroadcastChannel() {
        try {
            // Check if BroadcastChannel is supported
            if (typeof BroadcastChannel === 'undefined') {
                this.logSyncEvent('BroadcastChannel not supported', 'warn');
                return;
            }

            // Create channel
            this.broadcastChannel = new BroadcastChannel(this.SYNC_CHANNEL);

            // Handle messages
            this.broadcastChannel.onmessage = (event) => {
                this.handleBroadcastMessage(event.data);
            };

            // Handle errors
            this.broadcastChannel.onerror = (error) => {
                this.logSyncEvent(`BroadcastChannel error: ${error.message}`, 'error');
                this.updateSyncStatus('degraded');
            };

            this.isPrimarySync = true;
            this.logSyncEvent('BroadcastChannel established', 'success');
            this.updateSyncStatus('optimal');

        } catch (error) {
            this.logSyncEvent(`BroadcastChannel setup failed: ${error.message}`, 'error');
            this.isPrimarySync = false;
        }
    }

    /**
     * Handle incoming broadcast messages
     */
    handleBroadcastMessage(message) {
        try {
            const startTime = performance.now();

            // Log the message for debugging
            this.logSyncEvent(`Received broadcast: ${message.type}`, 'debug');

            switch (message.type) {
                case 'data_update':
                    this.handleDataUpdate(message.data, message.timestamp, message.source);
                    break;

                case 'sync_request':
                    this.handleSyncRequest(message.source);
                    break;

                case 'sync_response':
                    this.handleSyncResponse(message.data, message.timestamp);
                    break;

                case 'conflict_resolution':
                    this.handleConflictResolution(message.propertyId, message.resolution);
                    break;

                case 'admin_online':
                    this.handleAdminOnline(message.timestamp);
                    break;

                case 'admin_offline':
                    this.handleAdminOffline();
                    break;

                case 'ping':
                    this.handlePing(message.source);
                    break;

                case 'pong':
                    this.handlePong(message.source);
                    break;

                default:
                    this.logSyncEvent(`Unknown message type: ${message.type}`, 'warn');
            }

            // Update metrics
            this.syncMetrics.lastSyncDuration = performance.now() - startTime;
            this.syncMetrics.lastSyncTime = Date.now();
            this.syncMetrics.successfulSyncs++;

            // Reset consecutive failures on success
            this.syncMetrics.consecutiveFailures = 0;

        } catch (error) {
            this.logSyncEvent(`Error handling broadcast: ${error.message}`, 'error');
            this.syncMetrics.failedSyncs++;
            this.syncMetrics.consecutiveFailures++;

            // Trigger fallback if too many consecutive failures
            if (this.syncMetrics.consecutiveFailures >= 3) {
                this.updateSyncStatus('degraded');
                this.triggerFallbackSync();
            }
        }
    }

    /**
     * Handle data update messages
     */
    handleDataUpdate(data, timestamp, source) {
        // Validate timestamp
        if (timestamp <= this.lastKnownUpdate) {
            this.logSyncEvent('Received outdated update, ignoring', 'debug');
            return;
        }

        // Store the update
        this.lastKnownUpdate = timestamp;

        // Apply the update
        try {
            const currentData = this.getCurrentData();
            const mergedData = this.mergeData(currentData, data);

            // Save merged data
            this.saveData(mergedData);

            // Notify listeners
            this.notifyDataChanged(mergedData);

            // Update timestamp
            localStorage.setItem(this.LAST_UPDATE_KEY, timestamp.toString());

            // If this is admin panel, send acknowledgment
            if (this.isAdminPanel) {
                this.sendBroadcast({
                    type: 'sync_response',
                    data: mergedData,
                    timestamp: Date.now()
                });
            }

        } catch (error) {
            this.logSyncEvent(`Data merge failed: ${error.message}`, 'error');
            this.handleConflict(data, timestamp, source);
        }
    }

    /**
     * Handle sync requests
     */
    handleSyncRequest(source) {
        // Only admin panel should respond to sync requests
        if (!this.isAdminPanel) return;

        try {
            const currentData = this.getCurrentData();
            this.sendBroadcast({
                type: 'sync_response',
                data: currentData,
                timestamp: Date.now(),
                source: 'admin'
            });

        } catch (error) {
            this.logSyncEvent(`Sync request failed: ${error.message}`, 'error');
        }
    }

    /**
     * Handle sync responses
     */
    handleSyncResponse(data, timestamp) {
        // Only non-admin should process sync responses
        if (this.isAdminPanel) return;

        this.handleDataUpdate(data, timestamp, 'admin');
    }

    /**
     * Handle conflict resolution messages
     */
    handleConflictResolution(propertyId, resolution) {
        try {
            const currentData = this.getCurrentData();
            const propertyIndex = currentData.findIndex(p => p.id === propertyId);

            if (propertyIndex !== -1) {
                // Apply resolution
                currentData[propertyIndex] = resolution;

                // Save resolved data
                this.saveData(currentData);

                // Notify listeners
                this.notifyDataChanged(currentData);

                this.logSyncEvent(`Conflict resolved for property ${propertyId}`, 'success');
            }

        } catch (error) {
            this.logSyncEvent(`Conflict resolution failed: ${error.message}`, 'error');
        }
    }

    /**
     * Handle admin online status
     */
    handleAdminOnline(timestamp) {
        if (this.isAdminPanel) return;

        this.logSyncEvent('Admin panel detected online', 'info');

        // Request immediate sync
        this.requestSync();
    }

    /**
     * Handle admin offline status
     */
    handleAdminOffline() {
        if (this.isAdminPanel) return;

        this.logSyncEvent('Admin panel went offline', 'warn');
        this.updateSyncStatus('admin_offline');
    }

    /**
     * Handle ping messages
     */
    handlePing(source) {
        this.sendBroadcast({
            type: 'pong',
            source: this.isAdminPanel ? 'admin' : 'user'
        });
    }

    /**
     * Handle pong messages
     */
    handlePong(source) {
        // Update connectivity status
        this.updateSyncStatus('connected');
    }

    /**
     * Set up storage event listeners
     */
    setupStorageListeners() {
        window.addEventListener('storage', (event) => {
            this.handleStorageEvent(event);
        });
    }

    /**
     * Handle storage events (localStorage changes from other tabs)
     */
    handleStorageEvent(event) {
        try {
            // Ignore our own changes
            if (event.key === this.LAST_UPDATE_KEY && event.newValue) {
                const newTimestamp = parseInt(event.newValue);
                if (newTimestamp > this.lastKnownUpdate) {
                    this.logSyncEvent('Storage event detected, requesting sync', 'debug');
                    this.requestSync();
                }
            }

            // Handle admin online status changes
            if (event.key === this.ADMIN_ONLINE_KEY) {
                if (event.newValue) {
                    this.handleAdminOnline(parseInt(event.newValue));
                } else {
                    this.handleAdminOffline();
                }
            }

        } catch (error) {
            this.logSyncEvent(`Storage event error: ${error.message}`, 'error');
        }
    }

    /**
     * Set up custom events for same-tab communication
     */
    setupCustomEvents() {
        window.addEventListener('propertiesUpdated', () => {
            this.logSyncEvent('Custom event: propertiesUpdated', 'debug');
            this.requestSync();
        });
    }

    /**
     * Load initial data from storage
     */
    loadInitialData() {
        try {
            const storedData = localStorage.getItem(this.STORAGE_KEY);
            if (storedData) {
                const data = JSON.parse(storedData);
                this.lastKnownUpdate = parseInt(localStorage.getItem(this.LAST_UPDATE_KEY) || '0');
                this.logSyncEvent(`Loaded ${data.length} properties`, 'info');
            }

            // Load offline queue
            this.loadOfflineQueue();

        } catch (error) {
            this.logSyncEvent(`Initial data load failed: ${error.message}`, 'error');
        }
    }

    /**
     * Set up periodic sync
     */
    setupPeriodicSync() {
        // Clear any existing interval
        if (this.pollingIntervalId) {
            clearInterval(this.pollingIntervalId);
        }

        // Start with adaptive polling
        this.pollingIntervalId = setInterval(() => {
            this.periodicSyncCheck();
        }, this.getAdaptivePollingInterval());
    }

    /**
     * Get adaptive polling interval based on sync health
     */
    getAdaptivePollingInterval() {
        // If primary sync is working well, use longer intervals
        if (this.isPrimarySync && this.syncMetrics.consecutiveFailures === 0) {
            return Math.min(10000, this.POLLING_INTERVAL * 2); // Max 10 seconds
        }

        // If we're having issues, poll more frequently
        if (this.syncMetrics.consecutiveFailures > 0) {
            return Math.max(1000, this.POLLING_INTERVAL / 2); // Min 1 second
        }

        // Normal interval
        return this.POLLING_INTERVAL;
    }

    /**
     * Periodic sync check
     */
    periodicSyncCheck() {
        try {
            // Check if we should adjust polling interval
            const currentInterval = this.getAdaptivePollingInterval();
            if (this.pollingIntervalId) {
                clearInterval(this.pollingIntervalId);
                this.pollingIntervalId = setInterval(() => {
                    this.periodicSyncCheck();
                }, currentInterval);
            }

            // Check for updates
            const lastUpdate = parseInt(localStorage.getItem(this.LAST_UPDATE_KEY) || '0');
            if (lastUpdate > this.lastKnownUpdate) {
                this.logSyncEvent('Periodic check detected update', 'debug');
                this.requestSync();
            }

            // Send heartbeat if admin
            if (this.isAdminPanel) {
                this.sendAdminHeartbeat();
            }

        } catch (error) {
            this.logSyncEvent(`Periodic sync error: ${error.message}`, 'error');
        }
    }

    /**
     * Send admin heartbeat
     */
    sendAdminHeartbeat() {
        try {
            localStorage.setItem(this.ADMIN_ONLINE_KEY, Date.now().toString());

            // Also send via broadcast if available
            if (this.broadcastChannel) {
                this.sendBroadcast({
                    type: 'admin_online',
                    timestamp: Date.now()
                });
            }

        } catch (error) {
            this.logSyncEvent(`Heartbeat failed: ${error.message}`, 'error');
        }
    }

    /**
     * Set up offline queue processing
     */
    setupOfflineQueue() {
        // Check if we're online
        if (navigator.onLine) {
            this.processOfflineQueue();
        }

        // Listen for online events
        window.addEventListener('online', () => {
            this.logSyncEvent('Network connection restored', 'success');
            this.processOfflineQueue();
        });

        // Listen for offline events
        window.addEventListener('offline', () => {
            this.logSyncEvent('Network connection lost', 'warn');
            this.updateSyncStatus('offline');
        });
    }

    /**
     * Load offline queue from storage
     */
    loadOfflineQueue() {
        try {
            const queueData = localStorage.getItem(this.OFFLINE_QUEUE_KEY);
            if (queueData) {
                this.offlineQueue = JSON.parse(queueData);
                this.logSyncEvent(`Loaded ${this.offlineQueue.length} queued changes`, 'info');
            }

        } catch (error) {
            this.logSyncEvent(`Offline queue load failed: ${error.message}`, 'error');
        }
    }

    /**
     * Save offline queue to storage
     */
    saveOfflineQueue() {
        try {
            localStorage.setItem(this.OFFLINE_QUEUE_KEY, JSON.stringify(this.offlineQueue));
        } catch (error) {
            this.logSyncEvent(`Offline queue save failed: ${error.message}`, 'error');
        }
    }

    /**
     * Process offline queue
     */
    processOfflineQueue() {
        if (!navigator.onLine) {
            this.logSyncEvent('Cannot process queue - still offline', 'debug');
            return;
        }

        if (this.offlineQueue.length === 0) {
            this.logSyncEvent('No queued changes to process', 'debug');
            return;
        }

        this.logSyncEvent(`Processing ${this.offlineQueue.length} queued changes`, 'info');

        // Process each queued change
        const processedChanges = [];
        this.offlineQueue.forEach((change, index) => {
            try {
                // Apply the change
                const currentData = this.getCurrentData();
                const updatedData = this.applyChange(currentData, change);

                // Save the change
                this.saveData(updatedData);

                // Notify listeners
                this.notifyDataChanged(updatedData);

                // Mark as processed
                processedChanges.push(index);

                this.logSyncEvent(`Processed queued change ${index}`, 'success');

            } catch (error) {
                this.logSyncEvent(`Failed to process queued change ${index}: ${error.message}`, 'error');
            }
        });

        // Remove processed changes from queue
        this.offlineQueue = this.offlineQueue.filter((_, index) => !processedChanges.includes(index));
        this.saveOfflineQueue();

        // Request full sync after processing queue
        this.requestSync();
    }

    /**
     * Apply a change to data
     */
    applyChange(currentData, change) {
        switch (change.type) {
            case 'add':
                // Find max ID and increment
                const maxId = currentData.reduce((max, p) => p.id > max ? p.id : max, 0);
                change.data.id = maxId + 1;
                currentData.push(change.data);
                break;

            case 'update':
                const updateIndex = currentData.findIndex(p => p.id === change.data.id);
                if (updateIndex !== -1) {
                    currentData[updateIndex] = change.data;
                }
                break;

            case 'delete':
                const deleteIndex = currentData.findIndex(p => p.id === change.data.id);
                if (deleteIndex !== -1) {
                    currentData.splice(deleteIndex, 1);
                }
                break;

            default:
                this.logSyncEvent(`Unknown change type: ${change.type}`, 'warn');
        }

        return currentData;
    }

    /**
     * Set up visibility change listener
     */
    setupVisibilityListener() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.logSyncEvent('Page became visible, requesting sync', 'debug');
                this.requestSync();
            }
        });
    }

    /**
     * Set up beforeunload handler
     */
    setupBeforeUnload() {
        window.addEventListener('beforeunload', () => {
            // Save any pending changes to offline queue
            if (this.pendingChanges.size > 0) {
                this.logSyncEvent('Saving pending changes before unload', 'info');

                this.pendingChanges.forEach((change, id) => {
                    this.offlineQueue.push(change);
                });

                this.saveOfflineQueue();
            }
        });
    }

    /**
     * Check admin online status
     */
    checkAdminOnlineStatus() {
        if (this.isAdminPanel) return;

        try {
            const lastAdminOnline = localStorage.getItem(this.ADMIN_ONLINE_KEY);
            if (lastAdminOnline) {
                const lastOnlineTime = parseInt(lastAdminOnline);
                const timeSinceOnline = Date.now() - lastOnlineTime;

                // If admin was online in the last 10 seconds, consider them online
                if (timeSinceOnline < 10000) {
                    this.handleAdminOnline(lastOnlineTime);
                }
            }

        } catch (error) {
            this.logSyncEvent(`Admin status check failed: ${error.message}`, 'error');
        }
    }

    /**
     * Request sync from admin
     */
    requestSync() {
        try {
            // If we have primary sync, use it
            if (this.broadcastChannel) {
                this.sendBroadcast({
                    type: 'sync_request',
                    timestamp: Date.now(),
                    source: this.isAdminPanel ? 'admin' : 'user'
                });
                return;
            }

            // Fallback to storage-based sync request
            this.fallbackSyncRequest();

        } catch (error) {
            this.logSyncEvent(`Sync request failed: ${error.message}`, 'error');
            this.triggerFallbackSync();
        }
    }

    /**
     * Fallback sync request using storage events
     */
    fallbackSyncRequest() {
        try {
            // Use a special key to trigger sync
            const syncRequestKey = 'ring0_sync_request_' + Date.now();
            localStorage.setItem(syncRequestKey, Date.now().toString());

            // Remove it immediately to avoid clutter
            setTimeout(() => {
                localStorage.removeItem(syncRequestKey);
            }, 100);

            // Also try to force a storage event by updating last update time
            localStorage.setItem(this.LAST_UPDATE_KEY, Date.now().toString());

        } catch (error) {
            this.logSyncEvent(`Fallback sync request failed: ${error.message}`, 'error');
        }
    }

    /**
     * Trigger fallback sync mechanisms
     */
    triggerFallbackSync() {
        this.logSyncEvent('Triggering fallback sync mechanisms', 'warn');

        // 1. Try storage-based sync
        this.fallbackSyncRequest();

        // 2. Try polling-based sync
        this.forcePollingSync();

        // 3. Update status
        this.updateSyncStatus('degraded');
    }

    /**
     * Force immediate polling sync
     */
    forcePollingSync() {
        try {
            const lastUpdate = parseInt(localStorage.getItem(this.LAST_UPDATE_KEY) || '0');
            if (lastUpdate > this.lastKnownUpdate) {
                this.logSyncEvent('Forced polling sync detected update', 'debug');
                this.loadAndSyncData();
            }

        } catch (error) {
            this.logSyncEvent(`Forced polling sync failed: ${error.message}`, 'error');
        }
    }

    /**
     * Load and sync data
     */
    loadAndSyncData() {
        try {
            const storedData = localStorage.getItem(this.STORAGE_KEY);
            if (storedData) {
                const data = JSON.parse(storedData);
                const lastUpdate = parseInt(localStorage.getItem(this.LAST_UPDATE_KEY) || '0');

                if (lastUpdate > this.lastKnownUpdate) {
                    this.lastKnownUpdate = lastUpdate;
                    this.notifyDataChanged(data);
                    this.logSyncEvent('Data synced via polling', 'success');
                }
            }

        } catch (error) {
            this.logSyncEvent(`Data sync failed: ${error.message}`, 'error');
        }
    }

    /**
     * Update property data
     */
    update(data) {
        return new Promise((resolve, reject) => {
            try {
                // Validate data
                if (!data || !Array.isArray(data)) {
                    throw new Error('Invalid data format');
                }

                // Check if we're online
                if (!navigator.onLine) {
                    this.logSyncEvent('Offline - queuing change', 'warn');

                    // Queue the change
                    this.offlineQueue.push({
                        type: 'update',
                        data: data,
                        timestamp: Date.now()
                    });

                    this.saveOfflineQueue();
                    return resolve({ success: false, queued: true });
                }

                // Get current data
                const currentData = this.getCurrentData();

                // Merge data with conflict resolution
                const mergedData = this.mergeData(currentData, data);

                // Save merged data
                this.saveData(mergedData);

                // Broadcast the change
                this.broadcastChange(mergedData);

                // Notify listeners
                this.notifyDataChanged(mergedData);

                resolve({ success: true, data: mergedData });

            } catch (error) {
                this.logSyncEvent(`Update failed: ${error.message}`, 'error');
                reject(error);
            }
        });
    }

    /**
     * Add new property
     */
    add(property) {
        return new Promise((resolve, reject) => {
            try {
                // Validate property
                if (!property || typeof property !== 'object') {
                    throw new Error('Invalid property data');
                }

                // Check if we're online
                if (!navigator.onLine) {
                    this.logSyncEvent('Offline - queuing new property', 'warn');

                    // Queue the change
                    this.offlineQueue.push({
                        type: 'add',
                        data: property,
                        timestamp: Date.now()
                    });

                    this.saveOfflineQueue();
                    return resolve({ success: false, queued: true });
                }

                // Get current data
                const currentData = this.getCurrentData();

                // Add the property
                const maxId = currentData.reduce((max, p) => p.id > max ? p.id : max, 0);
                property.id = maxId + 1;
                currentData.push(property);

                // Save data
                this.saveData(currentData);

                // Broadcast the change
                this.broadcastChange(currentData);

                // Notify listeners
                this.notifyDataChanged(currentData);

                resolve({ success: true, property: property });

            } catch (error) {
                this.logSyncEvent(`Add failed: ${error.message}`, 'error');
                reject(error);
            }
        });
    }

    /**
     * Delete property
     */
    delete(propertyId) {
        return new Promise((resolve, reject) => {
            try {
                // Check if we're online
                if (!navigator.onLine) {
                    this.logSyncEvent('Offline - queuing deletion', 'warn');

                    // Queue the change
                    this.offlineQueue.push({
                        type: 'delete',
                        data: { id: propertyId },
                        timestamp: Date.now()
                    });

                    this.saveOfflineQueue();
                    return resolve({ success: false, queued: true });
                }

                // Get current data
                const currentData = this.getCurrentData();

                // Find and remove property
                const index = currentData.findIndex(p => p.id === propertyId);
                if (index === -1) {
                    throw new Error('Property not found');
                }

                const deletedProperty = currentData[index];
                currentData.splice(index, 1);

                // Save data
                this.saveData(currentData);

                // Broadcast the change
                this.broadcastChange(currentData);

                // Notify listeners
                this.notifyDataChanged(currentData);

                resolve({ success: true, property: deletedProperty });

            } catch (error) {
                this.logSyncEvent(`Delete failed: ${error.message}`, 'error');
                reject(error);
            }
        });
    }

    /**
     * Get current data
     */
    getCurrentData() {
        try {
            const storedData = localStorage.getItem(this.STORAGE_KEY);
            return storedData ? JSON.parse(storedData) : [];

        } catch (error) {
            this.logSyncEvent(`Get data failed: ${error.message}`, 'error');
            return [];
        }
    }

    /**
     * Save data to storage
     */
    saveData(data) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
            localStorage.setItem(this.LAST_UPDATE_KEY, Date.now().toString());

            // Update last known update
            this.lastKnownUpdate = Date.now();

            this.logSyncEvent(`Saved ${data.length} properties`, 'debug');

        } catch (error) {
            this.logSyncEvent(`Save data failed: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Merge data with conflict resolution
     */
    mergeData(currentData, newData) {
        try {
            // Create a map of current data for easy lookup
            const currentMap = new Map(currentData.map(p => [p.id, p]));

            // Process each item in new data
            newData.forEach(newProperty => {
                if (currentMap.has(newProperty.id)) {
                    // Existing property - resolve conflicts
                    const currentProperty = currentMap.get(newProperty.id);
                    const resolvedProperty = this.resolveConflict(currentProperty, newProperty);
                    currentMap.set(newProperty.id, resolvedProperty);
                } else {
                    // New property - add it
                    currentMap.set(newProperty.id, newProperty);
                }
            });

            // Convert back to array
            const mergedData = Array.from(currentMap.values());

            // Sort by ID to maintain consistent order
            mergedData.sort((a, b) => a.id - b.id);

            return mergedData;

        } catch (error) {
            this.logSyncEvent(`Merge conflict: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Resolve conflicts between two versions of the same property
     */
    resolveConflict(currentProperty, newProperty) {
        // Conflict resolution strategy:
        // 1. Admin changes always win over user changes
        // 2. For deletions, admin deletions win
        // 3. For other conflicts, use last-write-wins with metadata

        // Check if one version is deleted (doesn't exist in the other dataset)
        const currentExists = currentProperty && currentProperty.id;
        const newExists = newProperty && newProperty.id;

        // If current doesn't exist but new does, it's an addition (not a conflict)
        if (!currentExists && newExists) {
            return newProperty;
        }

        // If new doesn't exist but current does, it's a deletion
        if (currentExists && !newExists) {
            return null; // Mark for deletion
        }

        // Both exist - compare timestamps and sources
        const currentTimestamp = currentProperty.lastUpdated || 0;
        const newTimestamp = newProperty.lastUpdated || 0;

        // Add metadata if missing
        if (!currentProperty.lastUpdated) {
            currentProperty.lastUpdated = Date.now();
            currentProperty.updatedBy = this.isAdminPanel ? 'admin' : 'user';
        }

        if (!newProperty.lastUpdated) {
            newProperty.lastUpdated = Date.now();
            newProperty.updatedBy = this.isAdminPanel ? 'admin' : 'user';
        }

        // Conflict resolution rules:
        // 1. Admin changes always win
        if (newProperty.updatedBy === 'admin' && currentProperty.updatedBy !== 'admin') {
            this.logSyncEvent(`Conflict resolved: admin change wins (property ${newProperty.id})`, 'debug');
            return newProperty;
        }

        // 2. Newer changes win (last-write-wins)
        if (newTimestamp > currentTimestamp) {
            this.logSyncEvent(`Conflict resolved: newer change wins (property ${newProperty.id})`, 'debug');
            return newProperty;
        }

        // 3. If timestamps are equal, prefer the one with more complete data
        if (newTimestamp === currentTimestamp) {
            const resolved = this.mergePropertyData(currentProperty, newProperty);
            this.logSyncEvent(`Conflict resolved: merged data (property ${newProperty.id})`, 'debug');
            return resolved;
        }

        // 4. Default to current version
        this.logSyncEvent(`Conflict resolved: keeping current version (property ${newProperty.id})`, 'debug');
        return currentProperty;
    }

    /**
     * Merge property data intelligently
     */
    mergePropertyData(property1, property2) {
        // Create a new object to avoid mutation
        const merged = { ...property1 };

        // Merge all fields, preferring non-empty values
        const fieldsToMerge = ['name', 'regNumber', 'description', 'location', 'type', 'finderContact',
                              'claimantName', 'claimantContact', 'claimProof', 'image'];

        fieldsToMerge.forEach(field => {
            if (property2[field] && (!merged[field] || merged[field] === 'N/A')) {
                merged[field] = property2[field];
            }
        });

        // For status, prefer claimed over unclaimed
        if (property2.status === 'claimed') {
            merged.status = 'claimed';
        }

        // Update metadata
        merged.lastUpdated = Date.now();
        merged.updatedBy = 'merged';

        return merged;
    }

    /**
     * Broadcast changes to other tabs
     */
    broadcastChange(data) {
        try {
            if (this.broadcastChannel) {
                this.sendBroadcast({
                    type: 'data_update',
                    data: data,
                    timestamp: Date.now(),
                    source: this.isAdminPanel ? 'admin' : 'user'
                });
            }

            // Also trigger storage event for fallback
            localStorage.setItem(this.LAST_UPDATE_KEY, Date.now().toString());

        } catch (error) {
            this.logSyncEvent(`Broadcast failed: ${error.message}`, 'error');
        }
    }

    /**
     * Send broadcast message
     */
    sendBroadcast(message) {
        try {
            if (this.broadcastChannel) {
                this.broadcastChannel.postMessage(message);
                this.logSyncEvent(`Broadcast sent: ${message.type}`, 'debug');
            }

        } catch (error) {
            this.logSyncEvent(`Send broadcast failed: ${error.message}`, 'error');
        }
    }

    /**
     * Notify listeners about data changes
     */
    notifyDataChanged(data) {
        try {
            // Dispatch custom event
            window.dispatchEvent(new CustomEvent('propertiesUpdated', {
                detail: { data: data }
            }));

            // Update sync status
            this.updateSyncStatus('synced');

            // Log the change
            this.logSyncEvent(`Data changed, ${data.length} properties`, 'debug');

        } catch (error) {
            this.logSyncEvent(`Notification failed: ${error.message}`, 'error');
        }
    }

    /**
     * Update sync status
     */
    updateSyncStatus(status) {
        this.syncStatus = status;

        try {
            // Store status
            localStorage.setItem(this.SYNC_STATUS_KEY, JSON.stringify({
                status: status,
                timestamp: Date.now(),
                source: this.isAdminPanel ? 'admin' : 'user'
            }));

            // Dispatch status event
            window.dispatchEvent(new CustomEvent('syncStatusChanged', {
                detail: { status: status }
            }));

            this.logSyncEvent(`Sync status: ${status}`, 'info');

        } catch (error) {
            this.logSyncEvent(`Status update failed: ${error.message}`, 'error');
        }
    }

    /**
     * Get current sync status
     */
    getSyncStatus() {
        return this.syncStatus;
    }

    /**
     * Get sync metrics
     */
    getSyncMetrics() {
        return { ...this.syncMetrics };
    }

    /**
     * Log sync events for debugging
     */
    logSyncEvent(message, level = 'info') {
        // Only log in development or if debugging is enabled
        if (typeof console !== 'undefined') {
            const timestamp = new Date().toISOString();
            const logMessage = `[SyncManager] [${level.toUpperCase()}] [${timestamp}] ${message}`;

            switch (level) {
                case 'error':
                    console.error(logMessage);
                    break;
                case 'warn':
                    console.warn(logMessage);
                    break;
                case 'debug':
                    // Only log debug in development
                    if (process.env.NODE_ENV === 'development') {
                        console.debug(logMessage);
                    }
                    break;
                default:
                    console.log(logMessage);
            }
        }

        // Also dispatch log event for external monitoring
        try {
            window.dispatchEvent(new CustomEvent('syncLog', {
                detail: { message, level, timestamp: Date.now() }
            }));
        } catch (error) {
            // Silent failure for logging
        }
    }

    /**
     * Handle conflicts that couldn't be auto-resolved
     */
    handleConflict(newData, newTimestamp, source) {
        try {
            // Get current data
            const currentData = this.getCurrentData();

            // Identify conflicts
            const conflicts = this.detectConflicts(currentData, newData);

            if (conflicts.length === 0) {
                // No conflicts, just apply the update
                this.handleDataUpdate(newData, newTimestamp, source);
                return;
            }

            // Log conflicts
            this.logSyncEvent(`Detected ${conflicts.length} conflicts with ${source}`, 'warn');

            // For admin changes, always accept them
            if (source === 'admin') {
                this.logSyncEvent('Resolving conflicts: admin changes win', 'info');
                this.handleDataUpdate(newData, newTimestamp, source);
                return;
            }

            // For user changes, try to merge
            try {
                const mergedData = this.mergeData(currentData, newData);
                this.saveData(mergedData);
                this.notifyDataChanged(mergedData);
                this.logSyncEvent('Conflicts resolved by merging', 'success');

            } catch (mergeError) {
                this.logSyncEvent(`Merge failed: ${mergeError.message}`, 'error');

                // If admin is online, request conflict resolution
                if (this.isAdminOnline()) {
                    this.requestConflictResolution(conflicts, newData);
                } else {
                    // Queue the conflicting changes
                    this.queueConflictingChanges(conflicts, newData);
                }
            }

        } catch (error) {
            this.logSyncEvent(`Conflict handling failed: ${error.message}`, 'error');
        }
    }

    /**
     * Detect conflicts between two datasets
     */
    detectConflicts(currentData, newData) {
        const conflicts = [];

        // Create maps for easy comparison
        const currentMap = new Map(currentData.map(p => [p.id, p]));
        const newMap = new Map(newData.map(p => [p.id, p]));

        // Check each property for conflicts
        const allIds = new Set([...currentMap.keys(), ...newMap.keys()]);

        allIds.forEach(id => {
            const current = currentMap.get(id);
            const updated = newMap.get(id);

            // If one exists and the other doesn't, it's not a conflict (addition/deletion)
            if ((!current && updated) || (current && !updated)) {
                return;
            }

            // Compare the properties
            if (!this.propertiesEqual(current, updated)) {
                conflicts.push({
                    propertyId: id,
                    current: current,
                    updated: updated
                });
            }
        });

        return conflicts;
    }

    /**
     * Check if two properties are equal
     */
    propertiesEqual(prop1, prop2) {
        // Simple comparison for now - could be enhanced
        return JSON.stringify(prop1) === JSON.stringify(prop2);
    }

    /**
     * Check if admin is online
     */
    isAdminOnline() {
        try {
            const lastAdminOnline = localStorage.getItem(this.ADMIN_ONLINE_KEY);
            if (lastAdminOnline) {
                const lastOnlineTime = parseInt(lastAdminOnline);
                const timeSinceOnline = Date.now() - lastOnlineTime;
                return timeSinceOnline < 15000; // 15 seconds threshold
            }
            return false;

        } catch (error) {
            this.logSyncEvent(`Admin online check failed: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Request conflict resolution from admin
     */
    requestConflictResolution(conflicts, newData) {
        if (this.isAdminPanel) return;

        try {
            // Send conflict resolution request
            this.sendBroadcast({
                type: 'conflict_resolution_request',
                conflicts: conflicts,
                data: newData,
                timestamp: Date.now(),
                source: 'user'
            });

            this.logSyncEvent(`Conflict resolution requested for ${conflicts.length} properties`, 'info');

        } catch (error) {
            this.logSyncEvent(`Conflict resolution request failed: ${error.message}`, 'error');
        }
    }

    /**
     * Queue conflicting changes for later resolution
     */
    queueConflictingChanges(conflicts, newData) {
        try {
            // Store conflicts in offline queue for later resolution
            conflicts.forEach(conflict => {
                this.offlineQueue.push({
                    type: 'conflict',
                    conflict: conflict,
                    timestamp: Date.now()
                });
            });

            this.saveOfflineQueue();
            this.logSyncEvent(`Queued ${conflicts.length} conflicts for later resolution`, 'warn');

        } catch (error) {
            this.logSyncEvent(`Conflict queuing failed: ${error.message}`, 'error');
        }
    }

    /**
     * Clean up resources
     */
    destroy() {
        try {
            // Close broadcast channel
            if (this.broadcastChannel) {
                this.broadcastChannel.close();
                this.broadcastChannel = null;
            }

            // Clear intervals
            if (this.pollingIntervalId) {
                clearInterval(this.pollingIntervalId);
                this.pollingIntervalId = null;
            }

            // Remove event listeners
            window.removeEventListener('storage', this.handleStorageEvent);
            window.removeEventListener('online', this.processOfflineQueue);
            window.removeEventListener('offline', this.handleOffline);
            window.removeEventListener('visibilitychange', this.handleVisibilityChange);
            window.removeEventListener('beforeunload', this.handleBeforeUnload);

            this.logSyncEvent('SyncManager destroyed', 'info');

        } catch (error) {
            this.logSyncEvent(`Destroy failed: ${error.message}`, 'error');
        }
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PropertySyncManager;
}

// Auto-initialize if not in module system
if (typeof window !== 'undefined') {
    // Create global instance
    window.PropertySyncManager = PropertySyncManager;

    // Auto-initialize if not already present
    if (!window.propertySyncManager) {
        window.propertySyncManager = new PropertySyncManager();
    }
}
