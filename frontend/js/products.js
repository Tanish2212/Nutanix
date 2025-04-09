// Global variables
let currentPage = 1;
let totalPages = 1;
let products = [];
let searchQuery = '';
let categoryFilter = '';
let statusFilter = '';
let fakeData = null;
let updateInterval;

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    // Get search query from URL if present
    const urlParams = new URLSearchParams(window.location.search);
    searchQuery = urlParams.get('search') || '';
    
    // Set search input value if query exists
    const searchInput = document.getElementById('search-input');
    if (searchInput && searchQuery) {
        searchInput.value = searchQuery;
    }
    
    // Load fake data
    try {
        const response = await fetch('/fake_data.json');
        fakeData = await response.json();
    } catch (error) {
        console.error('Error loading fake data:', error);
        showNotification('Error loading data', 'error');
        return;
    }
    
    // Initial load
    await loadProducts();
    
    // Setup WebSocket connection
    setupWebSocketListeners();
    
    // Set up periodic updates
    updateInterval = setInterval(loadProducts, 3000);
    
    // Setup event listeners
    setupEventListeners();
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        clearInterval(updateInterval);
    });
});

// Load products from API
const loadProducts = async () => {
    try {
        showLoading(true);
        
        const response = await productAPI.getAllProducts();
        if (!response.success) {
            throw new Error(response.message || 'Failed to load products');
        }
        
        // Filter products based on search query and filters
        let filteredProducts = response.data;
        
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filteredProducts = filteredProducts.filter(product => 
                product.name.toLowerCase().includes(query) ||
                product.category.toLowerCase().includes(query)
            );
        }
        
        if (categoryFilter) {
            filteredProducts = filteredProducts.filter(product => 
                product.category === categoryFilter
            );
        }
        
        if (statusFilter) {
            filteredProducts = filteredProducts.filter(product => 
                product.status === statusFilter
            );
        }
        
        products = filteredProducts;
        updateProductsUI();
        
    } catch (error) {
        showNotification('Error loading products: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
};

// Update products UI
const updateProductsUI = () => {
    const productsList = document.getElementById('products-list');
    const noProducts = document.getElementById('no-products');
    
    if (!productsList) return;
    
    if (products.length === 0) {
        productsList.style.display = 'none';
        noProducts.style.display = 'block';
        return;
    }
    
    productsList.style.display = 'grid';
    noProducts.style.display = 'none';
    
    productsList.innerHTML = products.map(product => `
        <div class="product-card" data-id="${product.id}">
            <div class="product-header">
                <h3>${product.name}</h3>
                <span class="product-status status-${product.status}">${product.status}</span>
            </div>
            <div class="product-details">
                <div class="detail-item">
                    <label>Category:</label>
                    <span>${product.category}</span>
                </div>
                <div class="detail-item">
                    <label>SKU:</label>
                    <span>${product.sku}</span>
                </div>
                <div class="detail-item">
                    <label>Stock:</label>
                    <span>${product.current_stock} ${product.unit}</span>
                </div>
                <div class="detail-item">
                    <label>Price:</label>
                    <span>$${product.selling_price}</span>
                </div>
            </div>
            <div class="product-actions">
                <button class="btn btn-text view-product" title="View Details">
                    <span class="material-icons">visibility</span>
                </button>
                <button class="btn btn-text edit-product" title="Edit">
                    <span class="material-icons">edit</span>
                </button>
                <button class="btn btn-text delete-product" title="Delete">
                    <span class="material-icons">delete</span>
                </button>
            </div>
        </div>
    `).join('');
};

// Setup WebSocket listeners
const setupWebSocketListeners = () => {
    subscribeToEvent('product-update', (data) => {
        if (data.type === 'create') {
            products.push(data.data);
        } else if (data.type === 'update') {
            const index = products.findIndex(p => p.id === data.data.id);
            if (index !== -1) {
                products[index] = data.data;
            }
        } else if (data.type === 'delete') {
            products = products.filter(p => p.id !== data.data.id);
        }
        updateProductsUI();
    });
};

// Setup event listeners
const setupEventListeners = () => {
    // Add product button
    const addProductBtn = document.getElementById('add-product-btn');
    if (addProductBtn) {
        addProductBtn.addEventListener('click', () => {
            window.location.href = 'add-product.html';
        });
    }

    // Add first product button
    const addFirstProductBtn = document.getElementById('add-first-product');
    if (addFirstProductBtn) {
        addFirstProductBtn.addEventListener('click', () => {
            window.location.href = 'add-product.html';
        });
    }
    
    // Search input
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.trim();
            loadProducts();
        });
    }
    
    // Category filter
    const categoryFilterSelect = document.getElementById('category-filter');
    if (categoryFilterSelect) {
        categoryFilterSelect.addEventListener('change', (e) => {
            categoryFilter = e.target.value;
            loadProducts();
        });
    }
    
    // Status filter
    const statusFilterSelect = document.getElementById('status-filter');
    if (statusFilterSelect) {
        statusFilterSelect.addEventListener('change', (e) => {
            statusFilter = e.target.value;
            loadProducts();
        });
    }
    
    // Product card actions
    const productsList = document.getElementById('products-list');
    if (productsList) {
        productsList.addEventListener('click', (e) => {
            const card = e.target.closest('.product-card');
            if (!card) return;
            
            const productId = card.getAttribute('data-id');
            
            if (e.target.closest('.view-product')) {
                window.location.href = `product-detail.html?id=${productId}`;
            } else if (e.target.closest('.edit-product')) {
                window.location.href = `edit-product.html?id=${productId}`;
            } else if (e.target.closest('.delete-product')) {
                confirmDeleteProduct(productId);
            }
        });
    }
    
    // Delete modal buttons
    const closeModalBtn = document.getElementById('close-modal');
    const cancelDeleteBtn = document.getElementById('cancel-delete');
    const confirmDeleteBtn = document.getElementById('confirm-delete');
    
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            document.getElementById('delete-modal').classList.remove('active');
        });
    }
    
    if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener('click', () => {
            document.getElementById('delete-modal').classList.remove('active');
        });
    }
    
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', async () => {
            const productId = confirmDeleteBtn.dataset.productId;
            if (productId) {
                await deleteProduct(productId);
                document.getElementById('delete-modal').classList.remove('active');
            }
        });
    }
};

// Show loading indicator
const showLoading = (show) => {
    const loadingIndicator = document.getElementById('loading-indicator');
    const productsList = document.getElementById('products-list');
    
    if (loadingIndicator) {
        loadingIndicator.style.display = show ? 'flex' : 'none';
    }
    
    if (productsList) {
        productsList.style.display = show ? 'none' : 'grid';
    }
};

// Show notification
const showNotification = (message, type = 'info') => {
    // Implementation depends on your notification system
    console.log(`${type}: ${message}`);
};

// Confirm delete product
const confirmDeleteProduct = (productId) => {
    const modal = document.getElementById('delete-modal');
    const confirmBtn = document.getElementById('confirm-delete');
    
    if (modal && confirmBtn) {
        confirmBtn.dataset.productId = productId;
        modal.classList.add('active');
    }
};

// Delete product
const deleteProduct = async (productId) => {
    try {
        showLoading(true);
        
        const response = await productAPI.deleteProduct(productId);
        if (!response.success) {
            throw new Error(response.message || 'Failed to delete product');
        }
        
        showNotification('Product deleted successfully', 'success');
        await loadProducts();
        
    } catch (error) {
        showNotification('Error deleting product: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
};

// Navigate to specific page
const navigateToPage = (page) => {
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    loadProducts();
};

// Add form submit event listener
const productForm = document.getElementById('product-form');
if (productForm) {
    productForm.addEventListener('submit', handleProductFormSubmit);
}

// Handle form submission
const handleProductFormSubmit = async (e) => {
    e.preventDefault();
    
    const form = e.target;
    const mode = form.dataset.mode;
    const productId = form.dataset.productId;
    
    try {
        showLoading(true);
        
        const formData = new FormData(form);
        const productData = Object.fromEntries(formData.entries());
        
        const url = mode === 'add' ? '/api/products' : `/api/products/${productId}`;
        const method = mode === 'add' ? 'POST' : 'PUT';
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(productData)
        });
        
        if (!response.ok) {
            throw new Error(`Failed to ${mode} product`);
        }
        
        showNotification(`Product ${mode === 'add' ? 'added' : 'updated'} successfully`, 'success');
        
        // Close modal and refresh list
        const modal = bootstrap.Modal.getInstance(document.getElementById('product-modal'));
        modal.hide();
        loadProducts();
        
    } catch (error) {
        showNotification(`Error ${mode === 'add' ? 'adding' : 'updating'} product: ` + error.message, 'error');
    } finally {
        showLoading(false);
    }
};

// Open add product modal
const openAddProductModal = () => {
    // Clear form
    const form = document.getElementById('product-form');
    if (form) {
        form.reset();
        form.dataset.mode = 'add';
    }
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('product-modal'));
    modal.show();
};

// Open edit product modal
const openEditProductModal = async (productId) => {
    try {
        showLoading(true);
        
        // Fetch product details
        const response = await fetch(`/api/products/${productId}`);
        if (!response.ok) {
            throw new Error('Failed to fetch product details');
        }
        
        const product = await response.json();
        
        // Fill form with product data
        const form = document.getElementById('product-form');
        if (form) {
            form.dataset.mode = 'edit';
            form.dataset.productId = productId;
            
            // Fill form fields
            form.elements['name'].value = product.name;
            form.elements['category'].value = product.category;
            form.elements['quantity'].value = product.quantity;
            form.elements['price'].value = product.price;
            form.elements['status'].value = product.status;
        }
        
        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('product-modal'));
        modal.show();
        
    } catch (error) {
        showNotification('Error loading product details: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
};

// Update pagination UI
const updatePaginationUI = () => {
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    const pageInfo = document.getElementById('page-info');
    
    if (prevBtn) {
        prevBtn.disabled = currentPage === 1;
    }
    
    if (nextBtn) {
        nextBtn.disabled = currentPage === totalPages;
    }
    
    if (pageInfo) {
        pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    }
}; 