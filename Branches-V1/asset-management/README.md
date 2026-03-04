# Asset Management System

A Google Apps Script web application for tracking organizational assets and repairs. Monitor repair costs against replacement values to make data-driven maintenance decisions.

## Features

- **Dashboard**: Overview of asset health with statistics and alerts
- **Asset Tracking**: Monitor all assets with status indicators (Good, Monitor, Warning, Replace Now)
- **Repair History**: Complete repair log with running totals and cost analysis
- **Add Repairs**: Record new repairs with automatic cost calculations
- **Status Automation**: Automatic status updates based on repair costs vs replacement value

## Status Thresholds

| Status | Repair Cost % of Replacement |
|--------|------------------------------|
| GOOD | 0% - 24% |
| MONITOR | 25% - 49% |
| WARNING | 50% - 74% |
| REPLACE NOW | 75%+ |

## Setup

### 1. Create Google Spreadsheet

Create a new Google Spreadsheet with these sheets:

**Assets Sheet** (columns A-K):
- Asset ID, Asset Name, Category, Manufacturer, Model, Purchase Date, Notes, Replacement Cost, Total Repairs, % of Replacement, Status

**Repairs Sheet** (columns A-N):
- Repair ID, Asset ID, Asset Name, Repair Date, Part Name, Part Cost, Labor Hours, Labor Rate, Labor Cost, Total Cost, Running Total, % of Replacement, Days Since Last, Notes

**Settings Sheet** (columns A-B):
- Standard Labor Rate: 80
- Senior Labor Rate: 120
- Emergency Labor Rate: 150

### 2. Deploy as Web App

1. Open your Google Spreadsheet
2. Go to **Extensions > Apps Script**
3. Copy all files from this repository into the Apps Script editor
4. Update `SPREADSHEET_ID` in `code.gs` with your spreadsheet ID
5. Click **Deploy > New deployment**
6. Select **Web app**
7. Set **Execute as**: Me
8. Set **Who has access**: Anyone (or your preference)
9. Click **Deploy**

### 3. Access the App

Use the provided Web app URL to access your Asset Management System.

## Files

- `code.gs` - Server-side Google Apps Script functions
- `index.html` - Main HTML template
- `javascript.html` - Client-side JavaScript
- `styles.html` - CSS styles

## Technical Notes

- All data is serialized to primitive types (strings, numbers) before client transmission
- Date objects are converted to ISO strings to prevent serialization errors
- Error handling returns safe defaults to prevent UI crashes

## License

MIT License
