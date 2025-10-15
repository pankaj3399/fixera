// Comprehensive Solar Services Merger
// This script finds and merges duplicate solar services across all possible collections

const { MongoClient } = require('mongodb');
require('dotenv').config();

async function findAndMergeSolarDuplicates() {
  const client = new MongoClient(process.env.MONGODB_URI);
  
  try {
    await client.connect();
    const db = client.db();
    
    console.log("🔍 Searching for solar service duplicates...\n");
    
    // Define possible duplicate patterns
    const solarPatterns = [
      /solar.*pv.*battery/i,
      /solar.*panel.*battery/i,
      /pv.*battery.*storage/i,
      /solar.*battery.*storage/i,
      /battery.*solar/i
    ];
    
    const collections = await db.listCollections().toArray();
    let foundDuplicates = [];
    
    // 1. Check ServiceConfiguration collection
    console.log("1. Checking ServiceConfiguration collection...");
    try {
      const serviceConfigs = await db.collection('serviceconfigurations').find({
        $or: [
          { service: { $regex: /solar/i } },
          { service: { $regex: /battery/i } },
          { service: { $regex: /pv/i } },
          { name: { $regex: /solar/i } },
          { name: { $regex: /battery/i } }
        ]
      }).toArray();
      
      console.log(`Found ${serviceConfigs.length} solar-related service configurations:`);
      serviceConfigs.forEach(config => {
        console.log(`  - ${config._id}: "${config.service || config.name}"`);
      });
      
      // Find duplicates
      const duplicates = findDuplicateServices(serviceConfigs);
      if (duplicates.length > 0) {
        foundDuplicates.push({ collection: 'serviceconfigurations', duplicates });
      }
    } catch (error) {
      console.log("ServiceConfiguration collection not found or error:", error.message);
    }
    
    // 2. Check Services collection
    console.log("\n2. Checking Services collection...");
    try {
      const services = await db.collection('services').find({
        $or: [
          { service: { $regex: /solar/i } },
          { name: { $regex: /solar/i } },
          { service: { $regex: /battery/i } },
          { name: { $regex: /battery/i } }
        ]
      }).toArray();
      
      console.log(`Found ${services.length} solar-related services:`);
      services.forEach(service => {
        console.log(`  - ${service._id}: "${service.service || service.name}"`);
      });
      
      const duplicates = findDuplicateServices(services);
      if (duplicates.length > 0) {
        foundDuplicates.push({ collection: 'services', duplicates });
      }
    } catch (error) {
      console.log("Services collection not found or error:", error.message);
    }
    
    // 3. Check Categories collection
    console.log("\n3. Checking Categories collection...");
    try {
      const categories = await db.collection('categories').find({}).toArray();
      
      categories.forEach(category => {
        if (category.services && Array.isArray(category.services)) {
          const solarServices = category.services.filter(service => {
            const serviceName = typeof service === 'string' ? service : service.name;
            return serviceName && /solar|battery|pv/i.test(serviceName);
          });
          
          if (solarServices.length > 0) {
            console.log(`Category "${category.name}" has ${solarServices.length} solar services:`);
            solarServices.forEach(service => {
              const serviceName = typeof service === 'string' ? service : service.name;
              console.log(`  - "${serviceName}"`);
            });
          }
        }
      });
    } catch (error) {
      console.log("Categories collection not found or error:", error.message);
    }
    
    // 4. Manual search for exact duplicates
    console.log("\n4. Searching for specific duplicate patterns...");
    const exactSearches = [
      "Solar PV & battery storage",
      "Solar panel & battery",
      "Solar PV battery storage",
      "Solar panel battery",
      "Solar PV and battery storage",
      "Solar panel and battery"
    ];
    
    for (const searchTerm of exactSearches) {
      console.log(`Searching for: "${searchTerm}"`);
      
      // Search in all possible collections
      for (const collectionInfo of collections) {
        const collectionName = collectionInfo.name;
        if (collectionName.startsWith('system.')) continue;
        
        try {
          const results = await db.collection(collectionName).find({
            $or: [
              { service: { $regex: new RegExp(searchTerm, 'i') } },
              { name: { $regex: new RegExp(searchTerm, 'i') } },
              { title: { $regex: new RegExp(searchTerm, 'i') } }
            ]
          }).toArray();
          
          if (results.length > 0) {
            console.log(`  Found ${results.length} matches in ${collectionName}:`);
            results.forEach(result => {
              console.log(`    - ${result._id}: "${result.service || result.name || result.title}"`);
            });
          }
        } catch (error) {
          // Skip collections that can't be queried
        }
      }
    }
    
    // 5. Summary and merge recommendations
    console.log("\n" + "=".repeat(50));
    console.log("SUMMARY:");
    
    if (foundDuplicates.length === 0) {
      console.log("❌ No duplicate solar services found in standard collections.");
      console.log("💡 The duplicates might be:");
      console.log("   - In a different collection name");
      console.log("   - Using different field names");
      console.log("   - In seed/static data");
      console.log("   - Already cleaned up");
    } else {
      console.log("✅ Found duplicates! Ready to merge:");
      foundDuplicates.forEach(({ collection, duplicates }) => {
        console.log(`\n${collection}:`);
        duplicates.forEach(group => {
          console.log(`  Merge group: ${group.map(d => `"${d.service || d.name}"`).join(' + ')}`);
        });
      });
    }
    
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.close();
  }
}

function findDuplicateServices(services) {
  const duplicateGroups = [];
  const processed = new Set();
  
  for (let i = 0; i < services.length; i++) {
    if (processed.has(i)) continue;
    
    const service1 = services[i];
    const name1 = (service1.service || service1.name || '').toLowerCase();
    
    if (!name1.includes('solar') && !name1.includes('battery')) continue;
    
    const group = [service1];
    processed.add(i);
    
    for (let j = i + 1; j < services.length; j++) {
      if (processed.has(j)) continue;
      
      const service2 = services[j];
      const name2 = (service2.service || service2.name || '').toLowerCase();
      
      // Check if they're similar solar/battery services
      if (areSimilarSolarServices(name1, name2)) {
        group.push(service2);
        processed.add(j);
      }
    }
    
    if (group.length > 1) {
      duplicateGroups.push(group);
    }
  }
  
  return duplicateGroups;
}

function areSimilarSolarServices(name1, name2) {
  // Normalize names
  const normalize = (name) => name
    .replace(/[&+]/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim();
  
  const n1 = normalize(name1);
  const n2 = normalize(name2);
  
  // Check if both contain solar/pv and battery
  const hasSolar1 = /solar|pv/i.test(n1);
  const hasBattery1 = /battery|storage/i.test(n1);
  const hasSolar2 = /solar|pv/i.test(n2);
  const hasBattery2 = /battery|storage/i.test(n2);
  
  return hasSolar1 && hasBattery1 && hasSolar2 && hasBattery2;
}

// Run the script
if (require.main === module) {
  findAndMergeSolarDuplicates().catch(console.error);
}

module.exports = { findAndMergeSolarDuplicates };
