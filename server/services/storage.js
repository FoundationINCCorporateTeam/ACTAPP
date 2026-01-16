/**
 * JSON Storage Utility
 * Provides atomic read/write operations for JSON data files
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// File locks to prevent concurrent writes
const fileLocks = new Map();

/**
 * Acquire a lock for a file
 */
async function acquireLock(filename) {
    while (fileLocks.get(filename)) {
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    fileLocks.set(filename, true);
}

/**
 * Release a lock for a file
 */
function releaseLock(filename) {
    fileLocks.delete(filename);
}

/**
 * Read data from a JSON file
 * @param {string} filename - The JSON file name (without path)
 * @param {*} defaultValue - Default value if file doesn't exist
 * @returns {*} The parsed JSON data
 */
async function read(filename, defaultValue = []) {
    const filepath = path.join(DATA_DIR, filename);
    
    try {
        if (!fs.existsSync(filepath)) {
            return defaultValue;
        }
        
        const data = fs.readFileSync(filepath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading ${filename}:`, error);
        return defaultValue;
    }
}

/**
 * Write data to a JSON file atomically
 * @param {string} filename - The JSON file name (without path)
 * @param {*} data - The data to write
 */
async function write(filename, data) {
    const filepath = path.join(DATA_DIR, filename);
    const tempPath = filepath + '.tmp.' + Date.now();
    
    await acquireLock(filename);
    
    try {
        // Write to temp file first
        fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
        
        // Rename temp file to actual file (atomic operation)
        fs.renameSync(tempPath, filepath);
    } catch (error) {
        console.error(`Error writing ${filename}:`, error);
        // Clean up temp file if it exists
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }
        throw error;
    } finally {
        releaseLock(filename);
    }
}

/**
 * Find a single item by property
 */
async function findOne(filename, predicate) {
    const data = await read(filename, []);
    return data.find(predicate);
}

/**
 * Find multiple items by property
 */
async function findMany(filename, predicate) {
    const data = await read(filename, []);
    return data.filter(predicate);
}

/**
 * Insert a new item
 */
async function insert(filename, item) {
    const data = await read(filename, []);
    data.push(item);
    await write(filename, data);
    return item;
}

/**
 * Update an item
 */
async function update(filename, predicate, updates) {
    const data = await read(filename, []);
    const index = data.findIndex(predicate);
    
    if (index === -1) {
        return null;
    }
    
    data[index] = { ...data[index], ...updates };
    await write(filename, data);
    return data[index];
}

/**
 * Delete an item
 */
async function remove(filename, predicate) {
    const data = await read(filename, []);
    const index = data.findIndex(predicate);
    
    if (index === -1) {
        return false;
    }
    
    data.splice(index, 1);
    await write(filename, data);
    return true;
}

/**
 * Get paginated results
 */
async function paginate(filename, predicate = () => true, page = 1, limit = 10, sort = null) {
    let data = await read(filename, []);
    data = data.filter(predicate);
    
    if (sort) {
        data.sort((a, b) => {
            if (sort.order === 'desc') {
                return b[sort.field] > a[sort.field] ? 1 : -1;
            }
            return a[sort.field] > b[sort.field] ? 1 : -1;
        });
    }
    
    const total = data.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const items = data.slice(start, start + limit);
    
    return {
        items,
        page,
        limit,
        total,
        totalPages
    };
}

module.exports = {
    read,
    write,
    findOne,
    findMany,
    insert,
    update,
    remove,
    paginate,
    DATA_DIR
};
