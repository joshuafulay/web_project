const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'records.json');

// Ensure data directory and JSON database file exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2), 'utf8');
}

// Middleware
app.use(express.json({ limit: '5mb' })); // Supports base64 logo & signature images
app.use(express.static(path.join(__dirname, 'public')));

// Helper functions for JSON persistence
function readRecords() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

function writeRecords(records) {
  fs.writeFileSync(DB_FILE, JSON.stringify(records, null, 2), 'utf8');
}

// 1. HEALTH CHECK ENDPOINT
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'online',
    engine: 'Node.js + Express.js',
    track: 'IT 314 - Network Technology (NT)',
    timestamp: new Date().toISOString()
  });
});

// 2. GET ALL HANDOVER / AUDIT RECORDS
app.get('/api/records', (req, res) => {
  try {
    const records = readRecords();
    res.status(200).json(records);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read records from server storage.' });
  }
});

// 3. GET ANALYTICS & SUMMARY METRICS
app.get('/api/stats', (req, res) => {
  try {
    const records = readRecords();
    const totalRecords = records.length;
    const signedCount = records.filter(r => Boolean(r.signatureData)).length;

    const rxValues = records
      .map(r => parseFloat(r.templateData?.opticalRx))
      .filter(val => !isNaN(val));

    const avgOpticalRx = rxValues.length > 0
      ? Number((rxValues.reduce((a, b) => a + b, 0) / rxValues.length).toFixed(2))
      : -18.5;

    const byTemplate = { handover: 0, lan: 0, tags: 0, rack: 0, diag: 0 };
    records.forEach(r => {
      if (byTemplate[r.template] !== undefined) {
        byTemplate[r.template]++;
      }
    });

    res.status(200).json({
      totalRecords,
      signedCount,
      pendingCount: totalRecords - signedCount,
      avgOpticalRx,
      byTemplate
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to compute analytics summary.' });
  }
});

// 4. CREATE OR UPDATE A HANDOVER RECORD (POST)
app.post('/api/records', (req, res) => {
  try {
    const payload = req.body;

    // Server-side input validation
    if (!payload || !payload.common || !payload.common.woNumber) {
      return res.status(400).json({
        error: 'Validation Error: Circuit / Work Order Number (woNumber) is required.'
      });
    }

    const records = readRecords();
    const recordId = payload.id || `AUD-${Date.now()}`;
    const newRecord = {
      ...payload,
      id: recordId,
      updatedAt: new Date().toISOString()
    };

    const existingIndex = records.findIndex(
      r => r.id === recordId || r.common?.woNumber === newRecord.common.woNumber
    );

    if (existingIndex >= 0) {
      records[existingIndex] = newRecord;
    } else {
      records.push(newRecord);
    }

    writeRecords(records);
    res.status(201).json({
      message: 'Handover record saved successfully.',
      record: newRecord
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error while saving handover record.' });
  }
});

// 5. UPDATE RECORD BY ID (PUT)
app.put('/api/records/:id', (req, res) => {
  try {
    const { id } = req.params;
    const records = readRecords();
    const index = records.findIndex(r => r.id === id);

    if (index === -1) {
      return res.status(404).json({ error: 'Record not found.' });
    }

    records[index] = {
      ...records[index],
      ...req.body,
      id,
      updatedAt: new Date().toISOString()
    };

    writeRecords(records);
    res.status(200).json({ message: 'Record updated.', record: records[index] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update record.' });
  }
});

// 6. DELETE RECORD BY ID (DELETE)
app.delete('/api/records/:id', (req, res) => {
  try {
    const { id } = req.params;
    const records = readRecords();
    const filtered = records.filter(r => r.id !== id);

    if (filtered.length === records.length) {
      return res.status(404).json({ error: 'Record not found.' });
    }

    writeRecords(filtered);
    res.status(200).json({ message: 'Record deleted successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete record.' });
  }
});

// 7. BULK IMPORT RECORDS (POST)
app.post('/api/records/import', (req, res) => {
  try {
    const imported = req.body;
    if (!Array.isArray(imported)) {
      return res.status(400).json({ error: 'Expected an array of handover records.' });
    }
    writeRecords(imported);
    res.status(200).json({ message: `Imported ${imported.length} records.`, count: imported.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to import records.' });
  }
});

app.listen(PORT, () => {
  console.log(`========================================================`);
  console.log(` IT 314 Network Handover & Audit Suite Server Running`);
  console.log(` Open in Browser: http://localhost:${PORT}`);
  console.log(`========================================================`);
});