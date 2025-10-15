// Diagnostic script to find solar service duplicates
// Run this in your MongoDB shell or as a Node.js script

// 1. Check all collections for solar-related services
console.log("=== DIAGNOSTIC: Finding Solar Service Duplicates ===\n");

// Check ServiceConfiguration collection
console.log("1. Checking ServiceConfiguration collection:");
db.serviceconfigurations.find({
  $or: [
    { service: /solar/i },
    { service: /battery/i },
    { service: /pv/i },
    { name: /solar/i },
    { name: /battery/i },
    { name: /pv/i }
  ]
}).forEach(doc => {
  console.log(`- ID: ${doc._id}, Service: "${doc.service}", Name: "${doc.name || 'N/A'}"`);
});

// Check Services collection (if exists)
console.log("\n2. Checking Services collection:");
try {
  db.services.find({
    $or: [
      { service: /solar/i },
      { service: /battery/i },
      { service: /pv/i },
      { name: /solar/i },
      { name: /battery/i },
      { name: /pv/i }
    ]
  }).forEach(doc => {
    console.log(`- ID: ${doc._id}, Service: "${doc.service || doc.name}", Category: "${doc.category || 'N/A'}"`);
  });
} catch(e) {
  console.log("Services collection not found or empty");
}

// Check Categories collection for services array
console.log("\n3. Checking Categories collection:");
try {
  db.categories.find({}).forEach(category => {
    if (category.services && Array.isArray(category.services)) {
      category.services.forEach(service => {
        if (service && typeof service === 'string' && /solar|battery|pv/i.test(service)) {
          console.log(`- Category: "${category.name}", Service: "${service}"`);
        } else if (service && service.name && /solar|battery|pv/i.test(service.name)) {
          console.log(`- Category: "${category.name}", Service: "${service.name}"`);
        }
      });
    }
  });
} catch(e) {
  console.log("Categories collection not found or has different structure");
}

// Check Projects collection for solar services
console.log("\n4. Checking Projects collection for solar services:");
try {
  db.projects.find({
    $or: [
      { service: /solar/i },
      { service: /battery/i },
      { service: /pv/i }
    ]
  }).limit(5).forEach(project => {
    console.log(`- Project ID: ${project._id}, Service: "${project.service}", Category: "${project.category || 'N/A'}"`);
  });
} catch(e) {
  console.log("Projects collection not found or no solar projects");
}

// Check all collection names to see what exists
console.log("\n5. Available collections:");
db.runCommand("listCollections").cursor.firstBatch.forEach(collection => {
  if (collection.name.includes('service') || collection.name.includes('category')) {
    console.log(`- ${collection.name}`);
  }
});

console.log("\n=== END DIAGNOSTIC ===");
