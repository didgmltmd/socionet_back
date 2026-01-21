require('dotenv').config()
const bcrypt = require('bcrypt')
const prisma = require('../lib/prisma')

async function run() {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD

  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required')
  }

  const passwordHash = await bcrypt.hash(password, 10)

  const existing = await prisma.user.findUnique({ where: { email } })

  if (existing) {
    await prisma.user.update({
      where: { email },
      data: {
        passwordHash,
        role: 'ADMIN',
        status: 'APPROVED',
        name: '\uc548\uc774\ud658',
      },
    })
    console.log('Admin user updated:', email)
  } else {
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'ADMIN',
        status: 'APPROVED',
        name: '\uc548\uc774\ud658',
      },
    })
    console.log('Admin user created:', email)
  }
}

run()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
