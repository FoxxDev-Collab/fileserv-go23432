"use client";

import { DocLayout } from "@/components/docs/doc-layout";

const content = `# FileServ Quick Start Guide

Get started with FileServ in just a few minutes.

---

## 1. First Login

1. Open your FileServ URL in your browser
2. Login with default credentials:
   - **Username**: \`admin\`
   - **Password**: \`admin\`
3. **Change the password immediately!**

---

## 2. Create Storage Pool

1. Go to **Storage > Pools**
2. Click **Create Pool**
3. Enter:
   - Name: \`Primary Storage\`
   - Path: \`/srv/data\` (must exist on server)
4. Click **Create**

---

## 3. Create Share Zone

1. Go to **Storage > Zones**
2. Click **Create Zone**
3. Enter:
   - Name: \`User Files\`
   - Pool: Select "Primary Storage"
   - Path: \`users\`
   - Type: \`Personal\`
   - Enable **Auto-Provision**
   - Allowed Users: \`*\` (all users)
4. Click **Create**

---

## 4. Test File Upload

1. Go to **Files**
2. Select "User Files" zone
3. Click **Upload Files**
4. Select a file from your computer
5. File appears in the list!

---

## 5. Create a Share Link

1. In Files, click the share icon on any file
2. Configure options (or use defaults)
3. Click **Create Share Link**
4. Copy the URL and share it!

---

## Next Steps

- Read the **User Guide** for full feature documentation
- Read the **Admin Guide** for system administration
- Create additional users and zones

---

*Happy file sharing!*
`;

export default function QuickStartPage() {
  return (
    <DocLayout
      title="Quick Start Guide"
      content={content}
      nextDoc={{ title: "User Guide", href: "/docs/user-guide" }}
    />
  );
}
