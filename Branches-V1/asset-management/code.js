// ============================================
// CONFIGURATION
// ============================================

const SPREADSHEET_ID = '1aF_6nHHp8NA-eETkwZMUuTlPRPOiiKEvou-F9QuVTD8';

// Sheet names
const SHEETS = {
  ASSETS: 'Assets',
  REPAIRS: 'Repairs',
  DASHBOARD: 'Dashboard',
  DECISION: 'Decision',
  SETTINGS: 'Settings'
};

// Column mappings for Assets sheet (0-indexed)
const ASSET_COLUMNS = {
  ASSET_ID: 0,            // A
  ASSET_NAME: 1,          // B
  CATEGORY: 2,            // C
  MANUFACTURER: 3,        // D
  MODEL: 4,               // E
  PURCHASE_DATE: 5,       // F
  NOTES: 6,               // G
  REPLACEMENT_COST: 7,    // H
  TOTAL_REPAIRS: 8,       // I
  PCT_OF_REPLACEMENT: 9,  // J
  STATUS: 10              // K
};

// Column mappings for Repairs sheet (0-indexed)
const REPAIR_COLUMNS = {
  REPAIR_ID: 0,           // A
  ASSET_ID: 1,            // B
  ASSET_NAME: 2,          // C
  REPAIR_DATE: 3,         // D
  PART_NAME: 4,           // E
  PART_COST: 5,           // F
  LABOR_HOURS: 6,         // G
  LABOR_RATE: 7,          // H
  LABOR_COST: 8,          // I
  TOTAL_COST: 9,          // J
  RUNNING_TOTAL: 10,      // K
  PCT_OF_REPLACEMENT: 11, // L
  DAYS_SINCE_LAST: 12,    // M
  NOTES: 13               // N
};

// ============================================
// WEB APP ENTRY POINT
// ============================================

function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('Asset Management System')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ============================================
// ASSET FUNCTIONS
// ============================================

function getAssets() {
  try {
    console.log('getAssets called');
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    console.log('Spreadsheet opened');
    const sheet = ss.getSheetByName(SHEETS.ASSETS);

    if (!sheet) {
      console.log('Sheet not found');
      return [];
    }
    console.log('Sheet found: yes');

    const data = sheet.getDataRange().getValues();
    console.log('Data rows: ' + data.length);
    const assets = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[ASSET_COLUMNS.ASSET_ID]) {
        // Convert Date to string if needed
        let purchaseDate = row[ASSET_COLUMNS.PURCHASE_DATE];
        if (purchaseDate instanceof Date) {
          purchaseDate = purchaseDate.toISOString();
        }
        
        assets.push({
          id: String(row[ASSET_COLUMNS.ASSET_ID] || ''),
          name: String(row[ASSET_COLUMNS.ASSET_NAME] || ''),
          category: String(row[ASSET_COLUMNS.CATEGORY] || ''),
          manufacturer: String(row[ASSET_COLUMNS.MANUFACTURER] || ''),
          model: String(row[ASSET_COLUMNS.MODEL] || ''),
          purchaseDate: purchaseDate || '',
          replacementCost: parseFloat(row[ASSET_COLUMNS.REPLACEMENT_COST]) || 0,
          totalRepairs: parseFloat(row[ASSET_COLUMNS.TOTAL_REPAIRS]) || 0,
          percentOfReplacement: parseFloat(row[ASSET_COLUMNS.PCT_OF_REPLACEMENT]) || 0,
          status: String(row[ASSET_COLUMNS.STATUS] || 'GOOD'),
          notes: String(row[ASSET_COLUMNS.NOTES] || '')
        });
      }
    }

    console.log('Returning ' + assets.length + ' assets');
    return assets;
  } catch (error) {
    console.error('Error in getAssets:', error.toString());
    return [];
  }
}

// ============================================
// REPAIR FUNCTIONS
// ============================================

function getRepairs() {
  try {
    console.log('getRepairs called');
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEETS.REPAIRS);

    if (!sheet) {
      console.log('Repairs sheet not found');
      return [];
    }

    const data = sheet.getDataRange().getValues();
    console.log('Repairs data rows: ' + data.length);
    const repairs = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[REPAIR_COLUMNS.REPAIR_ID] || row[REPAIR_COLUMNS.ASSET_ID]) {
        // Convert Date to string if needed
        let repairDate = row[REPAIR_COLUMNS.REPAIR_DATE];
        if (repairDate instanceof Date) {
          repairDate = repairDate.toISOString();
        }
        
        repairs.push({
          repairId: String(row[REPAIR_COLUMNS.REPAIR_ID] || ''),
          assetId: String(row[REPAIR_COLUMNS.ASSET_ID] || ''),
          assetName: String(row[REPAIR_COLUMNS.ASSET_NAME] || ''),
          repairDate: repairDate || '',
          partName: String(row[REPAIR_COLUMNS.PART_NAME] || ''),
          partCost: parseFloat(row[REPAIR_COLUMNS.PART_COST]) || 0,
          laborHours: parseFloat(row[REPAIR_COLUMNS.LABOR_HOURS]) || 0,
          laborRate: parseFloat(row[REPAIR_COLUMNS.LABOR_RATE]) || 0,
          laborCost: parseFloat(row[REPAIR_COLUMNS.LABOR_COST]) || 0,
          totalCost: parseFloat(row[REPAIR_COLUMNS.TOTAL_COST]) || 0,
          runningTotal: parseFloat(row[REPAIR_COLUMNS.RUNNING_TOTAL]) || 0,
          percentOfReplacement: parseFloat(row[REPAIR_COLUMNS.PCT_OF_REPLACEMENT]) || 0,
          daysSinceLast: String(row[REPAIR_COLUMNS.DAYS_SINCE_LAST] || ''),
          notes: String(row[REPAIR_COLUMNS.NOTES] || '')
        });
      }
    }

    repairs.sort(function(a, b) {
      const dateA = new Date(a.repairDate);
      const dateB = new Date(b.repairDate);
      return dateB - dateA;
    });

    console.log('Returning ' + repairs.length + ' repairs');
    return repairs;
  } catch (error) {
    console.error('Error in getRepairs:', error.toString());
    return [];
  }
}

function addRepair(repairData) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const repairsSheet = ss.getSheetByName(SHEETS.REPAIRS);
    const assetsSheet = ss.getSheetByName(SHEETS.ASSETS);

    if (!repairsSheet || !assetsSheet) {
      return { success: false, message: 'Required sheets not found' };
    }

    const assets = getAssets();
    const asset = assets.find(function(a) { return a.id === repairData.assetId; });

    if (!asset) {
      return { success: false, message: 'Asset not found: ' + repairData.assetId };
    }

    const partCost = parseFloat(repairData.partCost) || 0;
    const laborHours = parseFloat(repairData.laborHours) || 0;
    const laborRate = parseFloat(repairData.laborRate) || 0;
    const laborCost = laborHours * laborRate;
    const totalCost = partCost + laborCost;

    const currentTotal = asset.totalRepairs || 0;
    const newRunningTotal = currentTotal + totalCost;

    const percentOfReplacement = asset.replacementCost > 0
      ? newRunningTotal / asset.replacementCost
      : 0;

    const repairId = 'REP' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHHmmss');

    repairsSheet.appendRow([
      repairId,                    // A - Repair ID
      repairData.assetId,          // B - Asset ID
      asset.name,                  // C - Asset Name
      repairData.repairDate,       // D - Repair Date
      repairData.partName || '',   // E - Part Name
      partCost,                    // F - Part Cost
      laborHours,                  // G - Labor Hours
      laborRate,                   // H - Labor Rate
      laborCost,                   // I - Labor Cost
      totalCost,                   // J - Total Cost
      newRunningTotal,             // K - Running Total
      percentOfReplacement,        // L - % of Replacement
      '',                                        // M - Days Since Last
      repairData.notes || '',                    // N - Notes
      repairData.outsideVendorName || ''         // O - Outside Vendor Name
    ]);

    updateAssetTotals(repairData.assetId);

    return {
      success: true,
      message: 'Repair added successfully! New total: $' + newRunningTotal.toFixed(2) + ' (' + (percentOfReplacement * 100).toFixed(1) + '% of replacement cost)'
    };
  } catch (error) {
    console.error('Error adding repair:', error);
    return { success: false, message: error.toString() };
  }
}

function updateAssetTotals(assetId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const assetsSheet = ss.getSheetByName(SHEETS.ASSETS);
    const repairsSheet = ss.getSheetByName(SHEETS.REPAIRS);

    const repairsData = repairsSheet.getDataRange().getValues();
    let totalRepairs = 0;

    for (let i = 1; i < repairsData.length; i++) {
      if (String(repairsData[i][REPAIR_COLUMNS.ASSET_ID]) === String(assetId)) {
        totalRepairs += parseFloat(repairsData[i][REPAIR_COLUMNS.TOTAL_COST]) || 0;
      }
    }

    const assetsData = assetsSheet.getDataRange().getValues();
    for (let i = 1; i < assetsData.length; i++) {
      if (String(assetsData[i][ASSET_COLUMNS.ASSET_ID]) === String(assetId)) {
        const rowNum = i + 1;
        const replacementCost = parseFloat(assetsData[i][ASSET_COLUMNS.REPLACEMENT_COST]) || 0;
        const percentOfReplacement = replacementCost > 0 ? totalRepairs / replacementCost : 0;

        assetsSheet.getRange(rowNum, ASSET_COLUMNS.TOTAL_REPAIRS + 1).setValue(totalRepairs);
        assetsSheet.getRange(rowNum, ASSET_COLUMNS.PCT_OF_REPLACEMENT + 1).setValue(percentOfReplacement);

        const status = getStatusFromPercentage(percentOfReplacement);
        assetsSheet.getRange(rowNum, ASSET_COLUMNS.STATUS + 1).setValue(status);

        break;
      }
    }
  } catch (error) {
    console.error('Error updating asset totals:', error);
  }
}

function getStatusFromPercentage(percent) {
  if (percent >= 0.75) return 'REPLACE NOW';
  if (percent >= 0.50) return 'WARNING';
  if (percent >= 0.25) return 'MONITOR';
  return 'GOOD';
}

function deleteRepairById(repairId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEETS.REPAIRS);
    const data = sheet.getDataRange().getValues();

    let assetIdToUpdate = null;

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][REPAIR_COLUMNS.REPAIR_ID]) === String(repairId)) {
        assetIdToUpdate = data[i][REPAIR_COLUMNS.ASSET_ID];
        sheet.deleteRow(i + 1);
        break;
      }
    }

    if (assetIdToUpdate) {
      recalculateRunningTotals(assetIdToUpdate);
      updateAssetTotals(assetIdToUpdate);
      return { success: true, message: 'Repair deleted and totals recalculated' };
    }

    return { success: false, message: 'Repair not found' };
  } catch (error) {
    console.error('Error deleting repair:', error);
    return { success: false, message: error.toString() };
  }
}

function deleteAssetRepairs(assetId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEETS.REPAIRS);
    const data = sheet.getDataRange().getValues();

    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][REPAIR_COLUMNS.ASSET_ID]) === String(assetId)) {
        sheet.deleteRow(i + 1);
      }
    }

    updateAssetTotals(assetId);

    return { success: true, message: 'All repairs deleted for ' + assetId };
  } catch (error) {
    console.error('Error deleting asset repairs:', error);
    return { success: false, message: error.toString() };
  }
}

function recalculateRunningTotals(assetId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const repairsSheet = ss.getSheetByName(SHEETS.REPAIRS);
    const assetsSheet = ss.getSheetByName(SHEETS.ASSETS);

    const assetsData = assetsSheet.getDataRange().getValues();
    let replacementCost = 0;
    for (let i = 1; i < assetsData.length; i++) {
      if (String(assetsData[i][ASSET_COLUMNS.ASSET_ID]) === String(assetId)) {
        replacementCost = parseFloat(assetsData[i][ASSET_COLUMNS.REPLACEMENT_COST]) || 0;
        break;
      }
    }

    const repairsData = repairsSheet.getDataRange().getValues();
    const repairs = [];

    for (let i = 1; i < repairsData.length; i++) {
      if (String(repairsData[i][REPAIR_COLUMNS.ASSET_ID]) === String(assetId)) {
        repairs.push({
          rowIndex: i + 1,
          date: new Date(repairsData[i][REPAIR_COLUMNS.REPAIR_DATE]),
          totalCost: parseFloat(repairsData[i][REPAIR_COLUMNS.TOTAL_COST]) || 0
        });
      }
    }

    repairs.sort(function(a, b) { return a.date - b.date; });

    let runningTotal = 0;
    repairs.forEach(function(repair) {
      runningTotal += repair.totalCost;
      const percentOfReplacement = replacementCost > 0 ? runningTotal / replacementCost : 0;

      repairsSheet.getRange(repair.rowIndex, REPAIR_COLUMNS.RUNNING_TOTAL + 1).setValue(runningTotal);
      repairsSheet.getRange(repair.rowIndex, REPAIR_COLUMNS.PCT_OF_REPLACEMENT + 1).setValue(percentOfReplacement);
    });
  } catch (error) {
    console.error('Error recalculating running totals:', error);
  }
}

// ============================================
// DASHBOARD FUNCTIONS
// ============================================

function getDashboardStats() {
  try {
    console.log('getDashboardStats called');
    const assets = getAssets();
    const repairs = getRepairs();

    let totalAssets = assets.length;
    let good = 0;
    let monitor = 0;
    let warnings = 0;
    let needReplacement = 0;
    let totalRepairCost = 0;

    assets.forEach(function(asset) {
      const status = (asset.status || '').toUpperCase();
      totalRepairCost += asset.totalRepairs || 0;

      if (status.indexOf('REPLACE') >= 0) {
        needReplacement++;
      } else if (status.indexOf('WARNING') >= 0) {
        warnings++;
      } else if (status.indexOf('MONITOR') >= 0) {
        monitor++;
      } else {
        good++;
      }
    });

    const topProblems = assets
      .filter(function(a) { return a.percentOfReplacement > 0.25; })
      .sort(function(a, b) { return b.percentOfReplacement - a.percentOfReplacement; })
      .slice(0, 6);

    const result = {
      totalAssets: totalAssets,
      good: good,
      monitor: monitor,
      warnings: warnings,
      needReplacement: needReplacement,
      totalRepairCost: totalRepairCost,
      averageRepairCost: totalAssets > 0 ? totalRepairCost / totalAssets : 0,
      totalRepairs: repairs.length,
      topProblems: topProblems
    };
    
    console.log('Returning dashboard stats');
    return result;
  } catch (error) {
    console.error('Error in getDashboardStats:', error.toString());
    return {
      totalAssets: 0,
      good: 0,
      monitor: 0,
      warnings: 0,
      needReplacement: 0,
      totalRepairCost: 0,
      averageRepairCost: 0,
      totalRepairs: 0,
      topProblems: []
    };
  }
}

// ============================================
// SETTINGS FUNCTIONS
// ============================================

function getSettings() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEETS.SETTINGS);

    if (!sheet) {
      return {
        standardLaborRate: 80,
        seniorLaborRate: 120,
        emergencyLaborRate: 150
      };
    }

    const data = sheet.getDataRange().getValues();
    const settings = {};

    for (let i = 1; i < data.length; i++) {
      const key = data[i][0];
      const value = data[i][1];

      if (key === 'Standard Labor Rate') settings.standardLaborRate = parseFloat(value) || 80;
      if (key === 'Senior Labor Rate') settings.seniorLaborRate = parseFloat(value) || 120;
      if (key === 'Emergency Labor Rate') settings.emergencyLaborRate = parseFloat(value) || 150;
    }

    return settings;
  } catch (error) {
    console.error('Error getting settings:', error);
    return {
      standardLaborRate: 80,
      seniorLaborRate: 120,
      emergencyLaborRate: 150
    };
  }
}

// ============================================
// DEBUG FUNCTIONS
// ============================================

function debugAssets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  const sheets = ss.getSheets();
  console.log('Available sheets:');
  sheets.forEach(function(s) { console.log('  - "' + s.getName() + '"'); });
  
  const assetsSheet = ss.getSheetByName('Assets');
  if (!assetsSheet) {
    console.log('ERROR: No sheet named "Assets" found!');
    return;
  }
  
  const data = assetsSheet.getDataRange().getValues();
  console.log('Total rows (including header): ' + data.length);
  console.log('Header row: ' + JSON.stringify(data[0]));
  
  if (data.length > 1) {
    console.log('First data row: ' + JSON.stringify(data[1]));
    console.log('Column A value (Asset ID): "' + data[1][0] + '"');
  }
}

function testGetAssets() {
  const assets = getAssets();
  console.log('Assets count: ' + (assets ? assets.length : 'NULL'));
  if (assets && assets.length > 0) {
    console.log('First asset: ' + JSON.stringify(assets[0]));
  }
}
