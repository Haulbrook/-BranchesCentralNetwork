/**
 * 🚀 Deployment Script for Deep Roots Operations Dashboard
 * 
 * This script handles various deployment scenarios:
 * - GitHub Pages
 * - Google Apps Script HTML Service
 * - Static hosting platforms
 */

const fs = require('fs');
const path = require('path');

class DeploymentManager {
    constructor() {
        this.deploymentType = process.env.DEPLOY_TYPE || 'github-pages';
        this.projectRoot = __dirname;
        this.buildDir = path.join(this.projectRoot, 'dist');
        this.config = this.loadConfig();
    }

    loadConfig() {
        try {
            const configPath = path.join(this.projectRoot, 'config.json');
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } catch (error) {
            console.warn('Could not load config.json, using defaults');
            return {};
        }
    }

    async deploy() {
        console.log(`🚀 Starting ${this.deploymentType} deployment...`);
        
        try {
            // Create build directory
            this.ensureBuildDir();
            
            // Copy and optimize files
            await this.prepareFiles();
            
            // Generate deployment-specific files
            switch (this.deploymentType) {
                case 'github-pages':
                    await this.deployToGitHubPages();
                    break;
                case 'google-apps-script':
                    await this.deployToGoogleAppsScript();
                    break;
                case 'static':
                    await this.deployStatic();
                    break;
                default:
                    throw new Error(`Unknown deployment type: ${this.deploymentType}`);
            }
            
            console.log('✅ Deployment completed successfully!');
        } catch (error) {
            console.error('❌ Deployment failed:', error);
            process.exit(1);
        }
    }

    ensureBuildDir() {
        if (fs.existsSync(this.buildDir)) {
            fs.rmSync(this.buildDir, { recursive: true });
        }
        fs.mkdirSync(this.buildDir, { recursive: true });
    }

    async prepareFiles() {
        console.log('📦 Preparing files...');
        
        // Copy main files
        this.copyFile('index.html');
        this.copyFile('config.json');
        
        // Copy directories
        this.copyDirectory('styles');
        this.copyDirectory('js');
        
        // Minify CSS and JS for production
        if (process.env.NODE_ENV === 'production') {
            await this.optimizeFiles();
        }
    }

    copyFile(filename) {
        const src = path.join(this.projectRoot, filename);
        const dest = path.join(this.buildDir, filename);
        
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, dest);
            console.log(`  ✓ Copied ${filename}`);
        } else {
            console.warn(`  ⚠️  File not found: ${filename}`);
        }
    }

    copyDirectory(dirname) {
        const src = path.join(this.projectRoot, dirname);
        const dest = path.join(this.buildDir, dirname);
        
        if (fs.existsSync(src)) {
            fs.mkdirSync(dest, { recursive: true });
            this.copyDirectoryRecursive(src, dest);
            console.log(`  ✓ Copied ${dirname}/`);
        } else {
            console.warn(`  ⚠️  Directory not found: ${dirname}`);
        }
    }

    copyDirectoryRecursive(src, dest) {
        const items = fs.readdirSync(src);
        
        items.forEach(item => {
            const srcPath = path.join(src, item);
            const destPath = path.join(dest, item);
            
            if (fs.statSync(srcPath).isDirectory()) {
                fs.mkdirSync(destPath, { recursive: true });
                this.copyDirectoryRecursive(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        });
    }

    async optimizeFiles() {
        console.log('⚡ Optimizing files...');
        
        // Basic minification (can be enhanced with proper tools)
        const cssFiles = this.findFiles(path.join(this.buildDir, 'styles'), '.css');
        const jsFiles = this.findFiles(path.join(this.buildDir, 'js'), '.js');
        
        // Remove comments and extra whitespace
        [...cssFiles, ...jsFiles].forEach(file => {
            let content = fs.readFileSync(file, 'utf8');
            
            // Remove comments
            content = content.replace(/\/\*[\s\S]*?\*\//g, '');
            content = content.replace(/\/\/.*$/gm, '');
            
            // Remove extra whitespace
            content = content.replace(/\s+/g, ' ').trim();
            
            fs.writeFileSync(file, content);
        });
    }

    findFiles(dir, extension) {
        const files = [];
        
        if (!fs.existsSync(dir)) return files;
        
        const items = fs.readdirSync(dir);
        items.forEach(item => {
            const itemPath = path.join(dir, item);
            if (fs.statSync(itemPath).isDirectory()) {
                files.push(...this.findFiles(itemPath, extension));
            } else if (item.endsWith(extension)) {
                files.push(itemPath);
            }
        });
        
        return files;
    }

    async deployToGitHubPages() {
        console.log('🔄 Configuring for GitHub Pages...');
        
        // Create .nojekyll file
        fs.writeFileSync(path.join(this.buildDir, '.nojekyll'), '');
        
        // Create CNAME file if custom domain is configured
        if (this.config.deployment?.domain) {
            fs.writeFileSync(
                path.join(this.buildDir, 'CNAME'), 
                this.config.deployment.domain
            );
        }
        
        console.log('✅ GitHub Pages configuration complete');
        console.log('📋 Next steps:');
        console.log('   1. Copy contents of dist/ to your repository');
        console.log('   2. Enable GitHub Pages in repository settings');
        console.log('   3. Choose "Deploy from a branch" -> main/docs');
    }

    async deployToGoogleAppsScript() {
        console.log('🔄 Configuring for Google Apps Script...');

        console.log('');
        console.log('⚠️  IMPORTANT: This project uses SEPARATE deployments:');
        console.log('');
        console.log('📦 BACKEND (Google Apps Script):');
        console.log('   - Deploy code.js to Google Apps Script as the backend API');
        console.log('   - File: code.js contains all the inventory/fleet logic + doPost()');
        console.log('   - Deploy as Web App with:');
        console.log('     • Execute as: User accessing the web app');
        console.log('     • Who has access: Anyone (or specific users)');
        console.log('   - Copy the deployment URL');
        console.log('');
        console.log('🌐 FRONTEND (Static Hosting):');
        console.log('   - Deploy index.html + js/ + styles/ to GitHub Pages/Netlify/Vercel');
        console.log('   - Update config.json with the backend URL from step above');
        console.log('   - The dashboard will make API calls to your backend');
        console.log('');
        console.log('❌ DO NOT try to deploy both together to Google Apps Script');
        console.log('   The dashboard (index.html) needs static hosting due to:');
        console.log('   - External CSS/JS references');
        console.log('   - Service worker support');
        console.log('   - Better performance and caching');
        console.log('');

        // Create a README for clarity
        const readme = `# Google Apps Script Backend Deployment

## Quick Setup

1. **Open Google Apps Script**
   - Go to https://script.google.com
   - Create a new project named "Deep Roots Inventory Backend"

2. **Copy code.js**
   - Copy the entire contents of code.js
   - Paste into Code.gs in Apps Script
   - Save the project

3. **Deploy as Web App**
   - Click "Deploy" → "New deployment"
   - Type: Web app
   - Execute as: User accessing the web app
   - Who has access: Anyone (or Anyone with Google account)
   - Click "Deploy"
   - Copy the Web app URL

4. **Update Frontend Configuration**
   - Edit config.json in your dashboard deployment
   - Set services.inventory.url to the Web app URL from step 3
   - Redeploy your frontend

## Testing the Backend

Test URL: YOUR_DEPLOYMENT_URL
Method: POST
Body:
\`\`\`json
{
  "function": "askInventory",
  "parameters": ["mulch"]
}
\`\`\`

Expected response:
\`\`\`json
{
  "success": true,
  "response": { "answer": "...", "source": "..." }
}
\`\`\`
`;

        fs.writeFileSync(path.join(this.buildDir, 'BACKEND_DEPLOYMENT.md'), readme);

        console.log('✅ Created BACKEND_DEPLOYMENT.md with instructions');
        console.log('📋 Use GitHub Pages or Netlify deploy for the frontend instead');
    }

    async deployStatic() {
        console.log('🔄 Configuring for static hosting...');

        // Create _redirects file for SPA routing (Netlify)
        // NOTE: The dashboard makes direct API calls to Google Apps Script
        // No proxy is needed - just serve static files and handle SPA routing
        const redirects = `
# Serve static assets first (CSS, JS, images)
/styles/*  /styles/:splat  200
/js/*      /js/:splat      200
/assets/*  /assets/:splat  200

# Single Page Application routing - catch-all must be last
/*  /index.html  200
        `;
        fs.writeFileSync(path.join(this.buildDir, '_redirects'), redirects.trim());
        
        // Create vercel.json for Vercel
        const vercelConfig = {
            "version": 2,
            "name": "deep-roots-dashboard",
            "builds": [
                {
                    "src": "index.html",
                    "use": "@vercel/static"
                }
            ],
            "routes": [
                {
                    "src": "/(.*)",
                    "dest": "/index.html"
                }
            ]
        };
        
        fs.writeFileSync(
            path.join(this.buildDir, 'vercel.json'),
            JSON.stringify(vercelConfig, null, 2)
        );
        
        console.log('✅ Static hosting configuration complete');
        console.log('📋 Deployment options:');
        console.log('   • Netlify: drag dist/ folder to netlify.app/drop');
        console.log('   • Vercel: vercel --prod');
        console.log('   • Firebase: firebase deploy');
    }

    generateManifest() {
        const manifest = {
            name: this.config.app?.name || "Deep Roots Operations Dashboard",
            short_name: "Deep Roots",
            description: this.config.app?.description || "Unified operational tools dashboard",
            start_url: "/",
            display: "standalone",
            background_color: "#1a1b23",
            theme_color: "#4CAF50",
            icons: [
                {
                    src: "icon-192.png",
                    sizes: "192x192",
                    type: "image/png"
                },
                {
                    src: "icon-512.png",
                    sizes: "512x512",
                    type: "image/png"
                }
            ]
        };
        
        fs.writeFileSync(
            path.join(this.buildDir, 'manifest.json'),
            JSON.stringify(manifest, null, 2)
        );
    }
}

// Run deployment if called directly
if (require.main === module) {
    const deployer = new DeploymentManager();
    deployer.deploy();
}

module.exports = DeploymentManager;