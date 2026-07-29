# Patient Messaging System — Schema Design Reference

## Overview
10 new models, 8 new enums. Integrates with existing Patient, User, Notification, AuditLog, Settings models.
Follow existing conventions: snake_case mapping, UUID PKs, DateTime defaults, cascade deletes.

## New Enums

```
enum ConversationStatus {
  OPEN
  AWAITING_REPLY
  RESOLVED
  ARCHIVED
}

enum MessageSenderType {
  PATIENT
  STAFF
  SYSTEM
}

enum MessageChannel {
  SMS
  WEB_CHAT
  PORTAL
  SYSTEM
}

enum MessageContentType {
  TEXT
  IMAGE
  FILE
  FORM_LINK
  SYSTEM_EVENT
}

enum MessageDeliveryStatus {
  QUEUED
  SENT
  DELIVERED
  READ
  FAILED
}

enum MessagingTriggerEvent {
  APPOINTMENT_REMINDER
  APPOINTMENT_CONFIRMED
  APPOINTMENT_CANCELLED
  NO_SHOW
  POST_VISIT
  NEW_PATIENT
  INTAKE_FORM_DUE
  CUSTOM
}

enum BroadcastStatus {
  DRAFT
  SCHEDULED
  SENDING
  SENT
  CANCELLED
}

enum MessageReason {
  SCHEDULING
  REFILL
  QUESTION
  URGENT
  INSURANCE
  RECORDS
  OTHER
}
```

## New Models

### Conversation
One per patient. The container for all messages across all channels.
```
model Conversation {
  id              String             @id @default(uuid())
  patientId       String             @unique @map("patient_id")
  status          ConversationStatus @default(OPEN)
  assignedToId    String?            @map("assigned_to_id")
  assignedInboxId String?            @map("assigned_inbox_id")
  lastMessageAt   DateTime?          @map("last_message_at")
  lastMessagePreview String?         @map("last_message_preview")
  unreadCount     Int                @default(0) @map("unread_count")
  reason          MessageReason?
  createdAt       DateTime           @default(now()) @map("created_at")
  updatedAt       DateTime           @updatedAt @map("updated_at")

  patient         Patient            @relation(fields: [patientId], references: [id], onDelete: Cascade)
  assignedTo      User?              @relation("ConversationAssignee", fields: [assignedToId], references: [id])
  assignedInbox   SharedInbox?       @relation(fields: [assignedInboxId], references: [id])
  messages        Message[]
  assignmentLogs  ConversationAssignmentLog[]

  @@index([status, assignedToId])
  @@index([lastMessageAt(sort: Desc)])
  @@map("conversations")
}
```

### Message
Individual message within a conversation. Content encrypted at rest.
```
model Message {
  id                String               @id @default(uuid())
  conversationId    String               @map("conversation_id")
  senderType        MessageSenderType    @map("sender_type")
  senderId          String?              @map("sender_id")
  channel           MessageChannel
  content           String               // encrypted with AES-256-GCM
  contentType       MessageContentType   @default(TEXT) @map("content_type")
  deliveryStatus    MessageDeliveryStatus @default(QUEUED) @map("delivery_status")
  externalMessageId String?              @map("external_message_id") // Twilio SID
  isInternalNote    Boolean              @default(false) @map("is_internal_note")
  readAt            DateTime?            @map("read_at")
  metadata          Json?                // file URLs, errors, form IDs
  createdAt         DateTime             @default(now()) @map("created_at")

  conversation      Conversation         @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender            User?                @relation("MessageSender", fields: [senderId], references: [id])

  @@index([conversationId, createdAt])
  @@index([externalMessageId])
  @@map("messages")
}
```

### SharedInbox
Team-based inboxes (Scheduling, Refills, Billing, Clinical).
```
model SharedInbox {
  id          String    @id @default(uuid())
  name        String
  description String?
  isDefault   Boolean   @default(false) @map("is_default")
  createdAt   DateTime  @default(now()) @map("created_at")

  members       SharedInboxMember[]
  conversations Conversation[]

  @@map("shared_inboxes")
}
```

### SharedInboxMember
Join table: staff subscriptions to shared inboxes.
```
model SharedInboxMember {
  id            String     @id @default(uuid())
  sharedInboxId String     @map("shared_inbox_id")
  userId        String     @map("user_id")
  createdAt     DateTime   @default(now()) @map("created_at")

  sharedInbox   SharedInbox @relation(fields: [sharedInboxId], references: [id], onDelete: Cascade)
  user          User        @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([sharedInboxId, userId])
  @@map("shared_inbox_members")
}
```

### MessageTemplate
Reusable templates with merge tags.
```
model MessageTemplate {
  id          String   @id @default(uuid())
  name        String
  category    String
  body        String
  channel     String   @default("BOTH") // SMS, PORTAL, BOTH
  isLocked    Boolean  @default(false) @map("is_locked")
  createdById String   @map("created_by_id")
  usageCount  Int      @default(0) @map("usage_count")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  createdBy   User     @relation("TemplateCreator", fields: [createdById], references: [id])
  automationRules MessagingAutomationRule[]
  broadcasts  Broadcast[]

  @@map("message_templates")
}
```

### MessagingAutomationRule
Event-driven automated message triggers.
```
model MessagingAutomationRule {
  id            String                @id @default(uuid())
  name          String
  triggerEvent  MessagingTriggerEvent @map("trigger_event")
  delayMinutes  Int                   @default(0) @map("delay_minutes")
  templateId    String                @map("template_id")
  channel       String                @default("BOTH")
  conditions    Json?                 // filtering conditions
  isActive      Boolean               @default(true) @map("is_active")
  createdAt     DateTime              @default(now()) @map("created_at")
  updatedAt     DateTime              @updatedAt @map("updated_at")

  template      MessageTemplate       @relation(fields: [templateId], references: [id])

  @@map("messaging_automation_rules")
}
```

### ConversationAssignmentLog
Audit trail for conversation routing.
```
model ConversationAssignmentLog {
  id              String   @id @default(uuid())
  conversationId  String   @map("conversation_id")
  fromUserId      String?  @map("from_user_id")
  toUserId        String?  @map("to_user_id")
  toInboxId       String?  @map("to_inbox_id")
  reason          String?
  createdAt       DateTime @default(now()) @map("created_at")

  conversation    Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@map("conversation_assignment_logs")
}
```

### PatientPortalSession
Magic-link auth sessions for patient portal.
```
model PatientPortalSession {
  id                String   @id @default(uuid())
  patientId         String   @map("patient_id")
  token             String   @unique // hashed
  phoneNumber       String   @map("phone_number")
  verifiedAt        DateTime? @map("verified_at")
  expiresAt         DateTime @map("expires_at")
  deviceFingerprint String?  @map("device_fingerprint")
  createdAt         DateTime @default(now()) @map("created_at")

  patient           Patient  @relation(fields: [patientId], references: [id], onDelete: Cascade)

  @@index([patientId, expiresAt])
  @@map("patient_portal_sessions")
}
```

### Broadcast
Bulk message campaigns.
```
model Broadcast {
  id              String          @id @default(uuid())
  name            String
  templateId      String          @map("template_id")
  segmentFilters  Json?           @map("segment_filters")
  status          BroadcastStatus @default(DRAFT)
  scheduledAt     DateTime?       @map("scheduled_at")
  sentAt          DateTime?       @map("sent_at")
  recipientCount  Int             @default(0) @map("recipient_count")
  deliveredCount  Int             @default(0) @map("delivered_count")
  failedCount     Int             @default(0) @map("failed_count")
  createdById     String          @map("created_by_id")
  createdAt       DateTime        @default(now()) @map("created_at")

  template        MessageTemplate @relation(fields: [templateId], references: [id])
  createdBy       User            @relation("BroadcastCreator", fields: [createdById], references: [id])

  @@map("broadcasts")
}
```

### SMSOptOut
TCPA compliance tracking.
```
model SMSOptOut {
  id          String    @id @default(uuid())
  patientId   String    @map("patient_id")
  phoneNumber String    @map("phone_number")
  optedOutAt  DateTime  @default(now()) @map("opted_out_at")
  optedInAt   DateTime? @map("opted_in_at")
  isOptedOut  Boolean   @default(true) @map("is_opted_out")

  patient     Patient   @relation(fields: [patientId], references: [id], onDelete: Cascade)

  @@index([phoneNumber])
  @@map("sms_opt_outs")
}
```

## Changes to Existing Models

### Patient — add relations:
```
// Add to existing Patient model:
conversation        Conversation?
portalSessions      PatientPortalSession[]
smsOptOuts          SMSOptOut[]
smsOptOut           Boolean   @default(false) @map("sms_opt_out")
```

### User — add relations:
```
// Add to existing User model:
assignedConversations  Conversation[]  @relation("ConversationAssignee")
sentMessages           Message[]       @relation("MessageSender")
sharedInboxMemberships SharedInboxMember[]
createdTemplates       MessageTemplate[] @relation("TemplateCreator")
createdBroadcasts      Broadcast[]     @relation("BroadcastCreator")
```

### Settings — add fields:
```
// Add to existing Settings model:
messagingEnabled       Boolean @default(false) @map("messaging_enabled")
smsProviderConfig      Json?   @map("sms_provider_config")
messagingBusinessHours Json?   @map("messaging_business_hours")
defaultRoutingRules    Json?   @map("default_routing_rules")
webChatWidgetConfig    Json?   @map("web_chat_widget_config")
portalConfig           Json?   @map("portal_config")
```

### Notification — add enum values:
Add to existing NotificationType: NEW_MESSAGE, MESSAGE_ASSIGNED, CONVERSATION_ESCALATED, BROADCAST_COMPLETED

### AuditLog — add action types:
Add to existing action enum: MESSAGE_SENT, MESSAGE_READ, CONVERSATION_ASSIGNED, CONVERSATION_RESOLVED, PORTAL_ACCESS, BROADCAST_SENT
