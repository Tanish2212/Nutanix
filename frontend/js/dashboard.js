// Global variables
let activityUpdateInterval;
let unreadLowStockCount = 0;
let lowStockItems = [];

// Initialize dashboard
document.addEventListener('DOMContentLoaded', async () => {
    // Initial data load
    await loadDashboardData();
    
    // Set up WebSocket connection for real-time updates
    setupWebSocketListeners();
    
    // Set up periodic updates (fallback)
    activityUpdateInterval = setInterval(loadRecentActivity, 30000); // Every 30 seconds
    
    // Update last updated time
    updateLastUpdatedTime();
    
    // Set up event listeners
    setupEventListeners();
    
    // Setup notification button
    setupNotificationButton();
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        clearInterval(activityUpdateInterval);
    });
});

// Load all dashboard data
async function loadDashboardData() {
    try {
        await Promise.all([
            loadSummaryData(),
            loadRecentActivity(),
            loadLowStockAlerts()
        ]);
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        showNotification('Failed to load dashboard data', 'error');
    }
}

// Load summary data
async function loadSummaryData() {
    try {
        const response = await dashboardAPI.getSummary();
        
        // If API fails, use mockup data
        if (!response.success) {
            throw new Error('Failed to load summary data');
        }
        
        // Update summary cards
        document.getElementById('total-products').textContent = response.data.totalProducts;
        document.getElementById('total-categories').textContent = response.data.totalCategories;
        document.getElementById('total-stock-value').textContent = formatCurrency(response.data.totalStockValue);
        document.getElementById('low-stock-items').textContent = response.data.lowStockItems;
    } catch (error) {
        console.error('Error loading summary data:', error);
        // Use fallback data
        await loadFallbackSummaryData();
    }
}

// Load fallback summary data from products.json
async function loadFallbackSummaryData() {
    try {
        // Try to load products from the backend folder
        const response = await fetch('/api/products');
        
        if (!response.ok) {
            throw new Error('Failed to fetch from API');
        }
        
        const data = await response.json();
        if (!data.success || !Array.isArray(data.data)) {
            throw new Error('Invalid data format');
        }
        
        const products = data.data;
        
        // Calculate summary data
        const totalProducts = products.length;
        const categories = new Set(products.map(p => p.category));
        const totalCategories = categories.size;
        
        // Properly handle numeric calculations to prevent NaN
        let totalStockValue = 0;
        products.forEach(p => {
            try {
                const stock = parseFloat(p.current_stock) || 0;
                const price = parseFloat(p.selling_price) || 0;
                totalStockValue += stock * price;
            } catch (e) {
                console.error('Error calculating stock value:', e);
            }
        });
        
        const lowStockItems = products.filter(p => {
            try {
                return parseFloat(p.current_stock) <= parseFloat(p.min_stock_level);
            } catch (e) {
                return false;
            }
        }).length;
        
        // Update summary cards
        document.getElementById('total-products').textContent = totalProducts;
        document.getElementById('total-categories').textContent = totalCategories;
        document.getElementById('total-stock-value').textContent = formatCurrency(totalStockValue);
        document.getElementById('low-stock-items').textContent = lowStockItems;
    } catch (error) {
        console.error('Fallback data loading failed:', error);
        
        // Use static fallback values as last resort
        document.getElementById('total-products').textContent = "10";
        document.getElementById('total-categories').textContent = "5";
        document.getElementById('total-stock-value').textContent = "$2,450.00";
        document.getElementById('low-stock-items').textContent = "2";
    }
}

// Load recent activity
async function loadRecentActivity() {
    try {
        const activityList = document.getElementById('recent-activity-list');
        
        if (!activityList) return;
        
        // Show loading indicator
        activityList.innerHTML = '<div class="loading small"></div>';
        
        // Fetch activity data
        const response = await dashboardAPI.getRecentActivity();
        
        if (!response.success) {
            throw new Error('Failed to load recent activity');
        }
        
        updateActivityList(activityList, response.data);
    } catch (error) {
        console.error('Error loading recent activity:', error);
        // Load mock activity data
        loadMockActivityData();
    }
}

// Load low stock alerts
async function loadLowStockAlerts() {
    try {
        const alertsList = document.getElementById('low-stock-alerts');
        
        if (!alertsList) return;
        
        // Show loading indicator
        alertsList.innerHTML = '<div class="loading small"></div>';
        
        // Fetch alerts data
        const response = await dashboardAPI.getLowStockAlerts();
        
        if (!response.success) {
            throw new Error('Failed to load low stock alerts');
        }
        
        if (response.data.length === 0) {
            alertsList.innerHTML = '<li class="event-item"><p>No low stock items found.</p></li>';
            
            // Update stock notification panel
            const stockNotifications = document.getElementById('stock-notifications');
            if (stockNotifications) {
                stockNotifications.innerHTML = '<li class="notification-item">No inventory alerts</li>';
            }
            
            // Clear lowStockItems array
            lowStockItems = [];
            updateNotificationBadge();
            return;
        }
        
        // Update alerts list
        alertsList.innerHTML = response.data.map(alert => {
            // Calculate how critical the stock level is
            const currentStock = parseFloat(alert.current_stock);
            const minStock = parseFloat(alert.min_stock_level);
            const ratio = currentStock / minStock;
            
            let severityClass = 'warning'; // default yellow
            
            if (ratio <= 0.5) {
                severityClass = 'critical'; // red - very low stock
            } else if (ratio <= 0.75) {
                severityClass = 'alert'; // orange - somewhat low
            }
            
            const stockDiff = minStock - currentStock;
            
            return `
                <li class="event-item stock-alert ${severityClass}">
                    <div class="event-header">
                        <span class="event-title">${alert.product_name}</span>
                        <span class="status-chip status-low_stock">Low Stock</span>
                    </div>
                    <p>Current stock: <strong>${alert.current_stock}</strong> ${alert.unit}</p>
                    <p>Min. required: ${alert.min_stock_level} ${alert.unit} 
                       <span class="stock-warning">Need ${stockDiff} more ${alert.unit}</span>
                    </p>
                    <div class="event-time">${formatTimeAgo(alert.last_updated)}</div>
                </li>
            `;
        }).join('');
        
        // Update notification panel
        const stockNotifications = document.getElementById('stock-notifications');
        if (stockNotifications) {
            stockNotifications.innerHTML = response.data.map(alert => {
                // Calculate how critical the stock level is
                const currentStock = parseFloat(alert.current_stock);
                const minStock = parseFloat(alert.min_stock_level);
                const ratio = currentStock / minStock;
                
                let severityClass = 'stock-alert warning'; // default yellow warning
                
                if (ratio <= 0 || currentStock === 0) {
                    severityClass = 'stock-alert critical'; // red - out of stock
                } else if (ratio < 0.5) {
                    severityClass = 'stock-alert alert'; // orange - very low stock
                }
                
                // Determine status badge text and class
                let statusText = 'Low Stock';
                let statusClass = 'status-low_stock';
                
                // Override status for zero stock
                if (currentStock === 0) {
                    statusText = 'NO STOCK';
                    statusClass = 'status-out-of-stock';
                }
                
                return `
                    <li class="notification-item">
                        <div class="notification-header">
                            <strong>${alert.product_name}</strong>
                            <span class="status-chip ${statusClass}">${statusText}</span>
                        </div>
                        <div class="${severityClass}">
                            <p>Current stock: <b>${alert.current_stock}</b> ${alert.unit}</p>
                            <p>Minimum stock: ${alert.min_stock_level} ${alert.unit}</p>
                        </div>
                        <p class="notification-time">${formatTimeAgo(alert.last_updated)}</p>
                    </li>
                `;
            }).join('');
        }
        
        // Update global variables for notifications
        if (lowStockItems.length < response.data.length) {
            unreadLowStockCount += (response.data.length - lowStockItems.length);
        }
        lowStockItems = response.data;
        updateNotificationBadge();
        
    } catch (error) {
        console.error('Error loading low stock alerts:', error);
        // Load mock alerts data
        loadMockAlertsData();
    }
}

// Update activity list
function updateActivityList(container, activities) {
    if (!container) return;
    
    if (!activities || activities.length === 0) {
        container.innerHTML = '<li class="event-item"><p>No recent activity found.</p></li>';
        return;
    }
    
    container.innerHTML = activities.map(activity => {
        // Determine if stock changed and by how much
        let stockChangeClass = '';
        let stockChangeInfo = '';
        
        if (activity.description && activity.description.includes('Stock updated')) {
            // Try to extract stock numbers from the description
            const stockMatch = activity.description.match(/from (\d+\.?\d*) to (\d+\.?\d*)/);
            if (stockMatch && stockMatch.length >= 3) {
                const oldValue = parseFloat(stockMatch[1]);
                const newValue = parseFloat(stockMatch[2]);
                const difference = newValue - oldValue;
                
                if (difference > 0) {
                    stockChangeClass = 'stock-increase';
                    stockChangeInfo = `<span class="stock-change increase">+${difference}</span>`;
                } else if (difference < 0) {
                    stockChangeClass = 'stock-decrease';
                    stockChangeInfo = `<span class="stock-change decrease">${difference}</span>`;
                }
            }
        }
        
        // Set appropriate class based on action type
        let eventClassType = activity.action || 'update';
        if (eventClassType === 'create') {
            eventClassType = 'create';
        } else if (eventClassType === 'delete') {
            eventClassType = 'delete';
        } else if (stockChangeClass) {
            eventClassType = stockChangeClass;
        }
        
        return `
            <li class="event-item ${eventClassType}">
                <div class="event-header">
                    <span class="event-title">${activity.product_name || 'Unknown Product'}</span>
                    <span class="event-type ${activity.action || 'update'}">${formatEventType(activity.action || 'update')}</span>
                </div>
                <p>${activity.description} ${stockChangeInfo}</p>
                <div class="event-time">${formatTimeAgo(activity.timestamp)}</div>
            </li>
        `;
    }).join('');
    
    // Update last updated time
    updateLastUpdatedTime();
}

// Setup WebSocket listeners for real-time updates
function setupWebSocketListeners() {
    try {
        if (typeof connectWebSocket !== 'function') {
            console.warn('WebSocket functions not available');
            return;
        }
        
        // Connect to WebSocket
        const socket = connectWebSocket();
        
        // Subscribe to activity updates from server
        subscribeToEvent('activity-update', handleActivityUpdate);
        
        // Subscribe to product updates
        subscribeToEvent('product-update', (data) => {
            // Handle product updates by refreshing the data
            loadSummaryData();
            
            // Show a notification for the update
            let message = '';
            switch(data.type) {
                case 'create':
                    message = `Product "${data.data.name}" was added`;
                    break;
                case 'update':
                    message = `Product "${data.data.name}" was updated`;
                    break;
                case 'delete':
                    message = `A product was deleted`;
                    break;
            }
            
            // Create activity entry for product updates
            const activityData = {
                product_name: data.data?.name || 'Unknown Product',
                action: data.type === 'create' ? 'create' : data.type === 'update' ? 'update' : 'delete',
                description: message,
                timestamp: new Date().toISOString()
            };
            
            // Pass to activity handler to update the UI
            handleActivityUpdate(activityData);
        });
        
        // Subscribe to low stock alerts
        subscribeToEvent('low-stock-update', handleLowStockUpdate);
        
        // Setup reconnection handling
        subscribeToEvent('connection', (status) => {
            if (status.connected) {
                console.log('Dashboard connected to real-time updates');
                // Reload data when reconnected
                loadDashboardData();
            } else {
                console.log('Dashboard disconnected from real-time updates');
            }
        });
    } catch (error) {
        console.error('Failed to setup WebSocket listeners:', error);
    }
}

// Handle new activity update
function handleActivityUpdate(data) {
    const activityList = document.getElementById('recent-activity-list');
    
    if (!activityList) return;
    
    // Determine if stock changed and by how much
    let stockChangeClass = '';
    let stockChangeInfo = '';
    
    if (data.description && data.description.includes('Stock updated')) {
        // Try to extract stock numbers from the description
        const stockMatch = data.description.match(/from (\d+\.?\d*) to (\d+\.?\d*)/);
        if (stockMatch && stockMatch.length >= 3) {
            const oldValue = parseFloat(stockMatch[1]);
            const newValue = parseFloat(stockMatch[2]);
            const difference = newValue - oldValue;
            
            if (difference > 0) {
                stockChangeClass = 'stock-increase';
                stockChangeInfo = `<span class="stock-change increase">+${difference}</span>`;
            } else if (difference < 0) {
                stockChangeClass = 'stock-decrease';
                stockChangeInfo = `<span class="stock-change decrease">${difference}</span>`;
            }
        }
    }
    
    // Set appropriate class based on action type
    let eventClassType = data.action || 'update';
    if (eventClassType === 'create') {
        eventClassType = 'create';
    } else if (eventClassType === 'delete') {
        eventClassType = 'delete';
    } else if (stockChangeClass) {
        eventClassType = stockChangeClass;
    }
    
    // Create new activity element
    const newActivityItem = document.createElement('li');
    newActivityItem.className = `event-item ${eventClassType}`;
    newActivityItem.innerHTML = `
        <div class="event-header">
            <span class="event-title">${data.product_name || 'Unknown Product'}</span>
            <span class="event-type ${data.action || 'update'}">${formatEventType(data.action || 'update')}</span>
        </div>
        <p>${data.description} ${stockChangeInfo}</p>
        <div class="event-time">${formatTimeAgo(data.timestamp)}</div>
    `;
    
    // Add animation class
    newActivityItem.classList.add('new-activity');
    
    // Add to the beginning of the list
    activityList.insertBefore(newActivityItem, activityList.firstChild);
    
    // Remove animation class after animation completes
    setTimeout(() => {
        newActivityItem.classList.remove('new-activity');
    }, 1000);
    
    // Remove oldest item if there are more than 5 items
    if (activityList.children.length > 5) {
        activityList.removeChild(activityList.lastChild);
    }
    
    // Update last updated time
    updateLastUpdatedTime();
    
    // Show notification based on activity type
    let notificationType = 'info';
    if (data.action === 'create') {
        notificationType = 'success';
    } else if (data.action === 'delete') {
        notificationType = 'error';
    } else if (stockChangeClass === 'stock-increase') {
        notificationType = 'success';
    } else if (stockChangeClass === 'stock-decrease') {
        notificationType = 'warning';
    }
    
    showNotification(`${data.product_name || 'Product'}: ${data.description}`, notificationType);
}

// Handle summary update
function handleSummaryUpdate(data) {
    // Update summary cards if data is provided
    if (data.totalProducts) {
        document.getElementById('total-products').textContent = data.totalProducts;
    }
    
    if (data.totalCategories) {
        document.getElementById('total-categories').textContent = data.totalCategories;
    }
    
    if (data.totalStockValue) {
        document.getElementById('total-stock-value').textContent = formatCurrency(data.totalStockValue);
    }
    
    if (data.lowStockItems) {
        document.getElementById('low-stock-items').textContent = data.lowStockItems;
    }
    
    // Update last updated time
    updateLastUpdatedTime();
}

// Handle low stock update
function handleLowStockUpdate(data) {
    const alertsList = document.getElementById('low-stock-alerts');
    
    if (!alertsList) return;
    
    // Update alerts list
    loadLowStockAlerts();
    
    // Increment unread count for notification badge
    unreadLowStockCount++;
    updateNotificationBadge();
}

// Update last updated time
function updateLastUpdatedTime() {
    const lastUpdatedElement = document.getElementById('last-updated-time');
    
    if (lastUpdatedElement) {
        const now = new Date();
        lastUpdatedElement.textContent = `Last updated: ${formatTime(now)}`;
    }
}

// Setup event listeners
function setupEventListeners() {
    const viewAllActivity = document.getElementById('view-all-activity');
    if (viewAllActivity) {
        viewAllActivity.addEventListener('click', () => {
            // Implement view all activity functionality
            // This could be a modal or redirect to a full activity page
            showNotification('View all activity coming soon', 'info');
        });
    }
    
    const viewAllAlerts = document.getElementById('view-all-alerts');
    if (viewAllAlerts) {
        viewAllAlerts.addEventListener('click', () => {
            // Implement view all alerts functionality
            showNotification('View all alerts coming soon', 'info');
        });
    }
}

// Load mock activity data
function loadMockActivityData() {
    const activityList = document.getElementById('recent-activity-list');
    
    if (!activityList) return;
    
    const mockActivities = [
        {
            product_name: 'Apple',
            action: 'update',
            description: 'Stock updated from 50 to 45 units',
            timestamp: new Date(Date.now() - 10 * 60000) // 10 minutes ago
        },
        {
            product_name: 'Milk',
            action: 'create',
            description: 'New product added with 36 units',
            timestamp: new Date(Date.now() - 30 * 60000) // 30 minutes ago
        },
        {
            product_name: 'Bananas',
            action: 'update',
            description: 'Price updated from $1.49 to $1.29',
            timestamp: new Date(Date.now() - 2 * 3600000) // 2 hours ago
        },
        {
            product_name: 'Cereal',
            action: 'update',
            description: 'Stock updated from 12 to 8 units',
            timestamp: new Date(Date.now() - 4 * 3600000) // 4 hours ago
        }
    ];
    
    updateActivityList(activityList, mockActivities);
}

// Load mock alerts data
function loadMockAlertsData() {
    const alertsList = document.getElementById('low-stock-alerts');
    
    if (!alertsList) return;
    
    const mockAlerts = [
        {
            product_name: 'Milk',
            current_stock: 12,
            min_stock_level: 15,
            unit: 'litres',
            last_updated: new Date(Date.now() - 30 * 60000) // 30 minutes ago
        },
        {
            product_name: 'Cereal',
            current_stock: 8,
            min_stock_level: 10,
            unit: 'packets',
            last_updated: new Date(Date.now() - 4 * 3600000) // 4 hours ago
        }
    ];
    
    alertsList.innerHTML = mockAlerts.map(alert => `
        <li class="event-item">
            <div class="event-header">
                <span class="event-title">${alert.product_name}</span>
                <span class="status-chip status-low_stock">Low Stock</span>
            </div>
            <p>Current stock: ${alert.current_stock} ${alert.unit}</p>
            <p>Min. required: ${alert.min_stock_level} ${alert.unit}</p>
            <div class="event-time">${formatTimeAgo(alert.last_updated)}</div>
        </li>
    `).join('');
    
    // Update notification panel
    const stockNotifications = document.getElementById('stock-notifications');
    if (stockNotifications) {
        stockNotifications.innerHTML = mockAlerts.map(alert => {
            // Calculate how critical the stock level is
            const currentStock = parseFloat(alert.current_stock);
            const minStock = parseFloat(alert.min_stock_level);
            const ratio = currentStock / minStock;
            
            let severityClass = 'stock-alert warning'; // default yellow warning
            
            if (ratio <= 0 || currentStock === 0) {
                severityClass = 'stock-alert critical'; // red - out of stock
            } else if (ratio < 0.5) {
                severityClass = 'stock-alert alert'; // orange - very low stock
            }
            
            return `
                <li class="notification-item">
                    <div class="notification-header">
                        <strong>${alert.product_name}</strong>
                        <span class="status-chip status-low_stock">Low Stock</span>
                    </div>
                    <div class="${severityClass}">
                        <p>Current stock: <b>${alert.current_stock}</b> ${alert.unit}</p>
                        <p>Minimum stock: ${alert.min_stock_level} ${alert.unit}</p>
                    </div>
                    <p class="notification-time">${formatTimeAgo(alert.last_updated)}</p>
                </li>
            `;
        }).join('');
    }
    
    // Update global variables for notifications
    if (lowStockItems.length < mockAlerts.length) {
        unreadLowStockCount += (mockAlerts.length - lowStockItems.length);
    }
    lowStockItems = mockAlerts;
    updateNotificationBadge();
}

// Format currency
function formatCurrency(amount) {
    // Ensure amount is a valid number
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount)) {
        return '$0.00';
    }
    return '$' + numAmount.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
}

// Format time ago
function formatTimeAgo(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.round(diffMs / 1000);
    const diffMin = Math.round(diffSec / 60);
    const diffHour = Math.round(diffMin / 60);
    const diffDay = Math.round(diffHour / 24);
    
    if (diffSec < 60) {
        return 'Just now';
    } else if (diffMin < 60) {
        return diffMin + ' minute' + (diffMin > 1 ? 's' : '') + ' ago';
    } else if (diffHour < 24) {
        return diffHour + ' hour' + (diffHour > 1 ? 's' : '') + ' ago';
    } else if (diffDay < 7) {
        return diffDay + ' day' + (diffDay > 1 ? 's' : '') + ' ago';
    } else {
        return formatDate(date);
    }
}

// Format date
function formatDate(date) {
    const options = { month: 'short', day: 'numeric', year: 'numeric' };
    return date.toLocaleDateString(undefined, options);
}

// Format time
function formatTime(date) {
    const options = { hour: '2-digit', minute: '2-digit' };
    return date.toLocaleTimeString(undefined, options);
}

// Format event type
function formatEventType(type) {
    if (!type) return 'Updated';
    
    switch (type.toLowerCase()) {
        case 'create':
            return 'Added';
        case 'update':
            return 'Updated';
        case 'delete':
            return 'Deleted';
        case 'stock_increase':
            return 'Stock Added';
        case 'stock_decrease':
            return 'Stock Removed';
        default:
            return type.charAt(0).toUpperCase() + type.slice(1);
    }
}

// Setup notification button
function setupNotificationButton() {
    const notificationButton = document.getElementById('notifications-button');
    const notificationPanel = document.getElementById('stock-notification-panel');
    const closeNotifications = document.getElementById('close-notifications');
    
    if (notificationButton && notificationPanel && closeNotifications) {
        // Toggle notification panel
        notificationButton.addEventListener('click', () => {
            notificationPanel.classList.toggle('visible');
            
            // Mark notifications as read when panel is opened
            if (notificationPanel.classList.contains('visible')) {
                unreadLowStockCount = 0;
                updateNotificationBadge();
            }
        });
        
        // Close notification panel
        closeNotifications.addEventListener('click', () => {
            notificationPanel.classList.remove('visible');
        });
        
        // Close panel if clicked outside
        document.addEventListener('click', (event) => {
            if (!notificationPanel.contains(event.target) && 
                !notificationButton.contains(event.target) && 
                notificationPanel.classList.contains('visible')) {
                notificationPanel.classList.remove('visible');
            }
        });
    }
    
    // Load low stock items for notifications
    loadLowStockAlerts();
}

// Update notification badge
function updateNotificationBadge() {
    const badge = document.getElementById('nav-notification-badge');
    const stockAlertCount = document.getElementById('stock-alert-count');
    
    if (badge) {
        if (unreadLowStockCount > 0) {
            badge.textContent = unreadLowStockCount;
            badge.classList.add('visible');
        } else {
            badge.classList.remove('visible');
        }
    }
    
    if (stockAlertCount) {
        stockAlertCount.textContent = lowStockItems.length;
    }
}