import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    // Get the first admin user for userId
    const adminUser = await prisma.user.findFirst({
      where: { role: 'ADMIN' }
    });

    if (!adminUser) {
      console.log('No admin user found. Creating a sample admin user first...');
      return;
    }

    // Create a sample intake form (unmatched)
    const sampleForm = await prisma.intakeForm.create({
      data: {
        userId: adminUser.id,
        formType: 'Well Child Visit',
        status: 'RECEIVED',
        fieldValues: {
          firstName: 'Emma',
          lastName: 'Johnson',
          dateOfBirth: '2018-03-15',
          email: 'emma.johnson@example.com',
          phone: '+1-555-123-4567',
          gender: 'Female',
          parentName: 'Sarah Johnson',
          parentPhone: '+1-555-123-4568',
          address: '123 Oak Street',
          city: 'Portland',
          state: 'OR',
          zipCode: '97201',
          insuranceProvider: 'Blue Cross',
          insurancePolicyNumber: 'BC123456789',
          visitReason: 'Annual well-child checkup',
          medicalHistory: 'No significant medical history',
        },
        extractedData: {
          firstName: 'Emma',
          lastName: 'Johnson',
          dateOfBirth: '2018-03-15',
          email: 'emma.johnson@example.com',
          phone: '+1-555-123-4567',
          gender: 'Female',
          parentName: 'Sarah Johnson',
          parentPhone: '+1-555-123-4568',
          address: '123 Oak Street',
          city: 'Portland',
          state: 'OR',
          zipCode: '97201',
        },
        matchConfidence: 92,
        processingStatus: 'COMPLETED',
      },
    });

    console.log('✅ Sample draft patient added successfully!');
    console.log('   Form ID:', sampleForm.id);
    console.log('   Patient Name: Emma Johnson');
    console.log('   Match Confidence: 92%');
    console.log('   Status: RECEIVED (unmatched)');
    console.log('\nYou can now view this in the Patients page > Draft Patients tab');
  } catch (error) {
    console.error('Error adding sample draft patient:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
