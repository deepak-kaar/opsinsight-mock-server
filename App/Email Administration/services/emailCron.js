// Email Administration/emailCron.js
import cron from "node-cron";
import nodemailer from "nodemailer";
import { connectToMongoDB } from "../../../config/connection.js";
import { getAttachment } from "../services/email_gridfs_service.js";
import { getReportImage } from "../../Report Image Administration/services/report_image_gridfs_service.js";
import { ObjectId } from "mongodb";
import ldap from 'ldapjs';
import crypto from 'crypto';

export function startEmailCron() {
  const cronExpression = "* * * * *";

  console.log("STARTING EMAIL CRON: Running every 1 minute...");

  return cron.schedule(cronExpression, async () => {
    console.log("CRON: Checking scheduled emails...");
    await runEmailProcess();
  });
}

export async function runEmailProcess() {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.EMAIL_COLLECTION;

    const now = new Date();

    const emails = await db.collection(collectionName).find({
      $or: [{ isActive: true }, { isActive: "true" }],
      $expr: {
        $and: [
          { $lte: [{ $toDate: "$sendAfter" }, now] },
          {
            $or: [
              { $eq: ["$lastSent", null] },
              { $lt: ["$lastSent", { $toDate: "$sendAfter" }] }
            ]
          }
        ]
      }
    }).toArray();

    //console.dir(emails, { depth: null, colors: true });

    for (let email of emails) {
      await sendEmail(email);
      await db.collection(collectionName).updateOne(
        { emailId: email.emailId },
        { $set: { lastSent: new Date() } }
      );
    }

  } catch (err) {
    console.error("CRON ERROR", err);
  }
}

// Helper function to process comma-separated email addresses
function processEmailAddresses(emailString) {
  if (!emailString) return undefined;
  return emailString.split(',').map(email => email.trim()).filter(email => email.length > 0);
}

// LDAP helper functions
const getGroupDN = (client, baseDN, groupName) => {
  return new Promise((resolve, reject) => {
    const filter = `(&(objectCategory=group)(cn=${groupName}))`;
    const searchOptions = {
      filter: filter,
      scope: 'sub',
      attributes: ['distinguishedName'],
      sizeLimit: 1,
      timeLimit: 30
    };

    let groupDN = null;

    client.search(baseDN, searchOptions, (err, res) => {
      if (err) return reject(err);

      res.on('searchEntry', (entry) => {
        entry.attributes.forEach((attr) => {
          if (attr.type === 'distinguishedName' && attr.vals && attr.vals.length > 0) {
            groupDN = attr.vals[0];
          }
        });
      });

      res.on('error', (err) => reject(err));
      res.on('end', () => {
        if (!groupDN) {
          reject(new Error(`Group not found: ${groupName}`));
        } else {
          resolve(groupDN);
        }
      });
    });
  });
};

const getMembers = (client, baseDN, groupDN, objectClass) => {
  return new Promise((resolve, reject) => {
    const filter = `(&(objectClass=${objectClass})(memberOf=${groupDN}))`;
    const searchOptions = {
      filter: filter,
      scope: 'sub',
      attributes: ['sAMAccountName'],
      paged: { pageSize: 500 },
      timeLimit: 30
    };

    const members = [];

    client.search(baseDN, searchOptions, (err, res) => {
      if (err) return reject(err);

      res.on('searchEntry', (entry) => {
        const member = {};
        entry.attributes.forEach((attr) => {
          if (attr.vals && attr.vals.length > 0) {
            member[attr.type] = attr.vals[0];
          }
        });
        members.push(member);
      });

      res.on('error', (err) => reject(err));
      res.on('end', () => resolve(members));
    });
  });
};

const getUsersRecursively = async (client, baseDN, groupDN, searchedGroups, searchedUsers) => {
  try {
    const subGroups = await getMembers(client, baseDN, groupDN, 'group');

    for (const subGroup of subGroups) {
      const subGroupName = subGroup.sAMAccountName;
      if (subGroupName && !searchedGroups.has(subGroupName)) {
        searchedGroups.add(subGroupName);
        const subGroupDN = await getGroupDN(client, baseDN, subGroupName);
        await getUsersRecursively(client, baseDN, subGroupDN, searchedGroups, searchedUsers);
      }
    }

    const users = await getMembers(client, baseDN, groupDN, 'user');
    for (const user of users) {
      const username = user.sAMAccountName;
      if (username) {
        searchedUsers.add(username.toUpperCase());
      }
    }

    return Array.from(searchedUsers).sort();
  } catch (error) {
    throw error;
  }
};

// Get LDAP users in group function
const getLdapUsersInGroup = async (configId, groupName) => {
  let client = null;

  try {
    const db = await connectToMongoDB();
    const config = await db.collection(process.env.CONFIG_COLLECTION).findOne({ _id: new ObjectId(configId) });

    if (!config) {
      throw new Error('Config not found');
    }

    let configValues = {};
    try {
      configValues = JSON.parse(config.configValue);
    } catch (err) {
      throw new Error('Invalid JSON in config.configValue');
    }

    const ldapUrl = configValues.LDAP_URL || process.env.LDAP_URL;
    const ldapSearchBase = configValues.LDAP_SEARCH_BASE || process.env.LDAP_SEARCH_BASE;
    const ldapBindDN = configValues.LDAP_BIND_DN || process.env.LDAP_BIND_DN || '';
    const ldapBindPassword = configValues.LDAP_BIND_PASSWORD || process.env.LDAP_BIND_PASSWORD || '';

    client = ldap.createClient({
      url: ldapUrl,
      timeout: 60000,
      connectTimeout: 30000,
      reconnect: false
    });

    await new Promise((resolve, reject) => {
      client.bind(ldapBindDN || '', ldapBindPassword || '', (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    const groupDN = await getGroupDN(client, ldapSearchBase, groupName);
    const searchedGroups = new Set();
    const searchedUsers = new Set();

    await getUsersRecursively(client, ldapSearchBase, groupDN, searchedGroups, searchedUsers);
    const users = Array.from(searchedUsers).sort();

    client.unbind();

    return {
      message: 'Successfully fetched users from LDAP group (recursive)',
      groupName: groupName,
      groupDN: groupDN,
      userCount: users.length,
      nestedGroupsCount: searchedGroups.size,
      users: users,
      nestedGroups: Array.from(searchedGroups).sort()
    };

  } catch (error) {
    if (client) {
      try {
        client.unbind();
      } catch (unbindError) {
        console.error('Error unbinding client:', unbindError);
      }
    }
    throw error;
  }
};

async function replacePlaceholdersWithCID(emailBody) {
  if (!emailBody || typeof emailBody !== "string") return { html: emailBody, cidAttachments: [] };

  const regex = /{{REP@([^}]+)}}/g;
  const matches = [...emailBody.matchAll(regex)];

  const db = await connectToMongoDB();
  const collectionName = process.env.REPORT_IMAGE_COLLECTION;

  const cidAttachments = [];
  let html = emailBody;

  for (const match of matches) {
    const placeholder = match[0];
    const filename = match[1].trim();
    // console.log("Collection:", collectionName);
    // console.log(">>", JSON.stringify(filename), "<<");
    // const all = await db.collection(collectionName).find({}, { projection: { name: 1 } }).toArray();
    // console.log(all);
    // Find uploaded image by logical name or physical filename
    const record = await db.collection(collectionName).findOne({
      $or: [
        { name: filename },
        { "fileName.filename": filename }
      ]
    });

    //console.log(record);

    if (!record || !record.fileName?.fileId) {
      console.warn(`Placeholder not resolved: ${placeholder}`);
      continue;
    }

    const fileId = record.fileName.fileId;
    const realFilename = record.fileName.filename;

    // Generate unique CID
    const cid = (
      realFilename.replace(/\s+/g, "_").toLowerCase() +
      "_" +
      crypto.randomUUID()
    );

    // Replace placeholder with HTML img tag
    html = html.replace(
      placeholder,
      `<img src="cid:${cid}" width="250" style="display:block; border:0; outline:none;" />`
    );

    // Get actual file buffer from GridFS
    const buffer = await getReportImage(fileId);

    cidAttachments.push({
      cid,
      filename: realFilename,
      content: buffer
    });
  }

  return { html, cidAttachments };
}

// SEND EMAIL
async function sendEmail(email) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.EMAIL_USER_COLLECTION;

    let result = await db.collection(collectionName).findOne({ key: "EMAIL_KEY" });

    if (!result) {
      console.warn("EMAIL_KEY not found → using first document in collection as fallback.");
      result = await db.collection(collectionName).findOne({});
    }

    if (!result) {
      throw new Error("No email configuration found in the database.");
    }

    const transporter = nodemailer.createTransport({
      host: 'exchange.aramco.com.sa',
      port: 25,
      secure: false,
      secureProtocol: 'TLSv1_2_method',
      pool: true,
      requireTLS: false,
      auth: { user: result.user, pass: result.pass },
      tls: { rejectUnauthorized: false, ignoreTLS: true }
    });

    const { html: processedHtml, cidAttachments } = await replacePlaceholdersWithCID(email.emailBody);

    //console.log(processedHtml);

    const attachmentsArray = [];

    if (email.attachments?.length) {
      for (const att of email.attachments) {
        const buf = await getAttachment(att.fileId);
        attachmentsArray.push({ filename: att.filename, content: buf });
      }
    }

    attachmentsArray.push(...cidAttachments);

    let toEmails;

    // Handle group emails vs regular emails
    if (email.isGroup === true || email.isGroup === 'true') {
      if (email.configId && email.groupName) {
        try {
          // Get fresh LDAP data
          const ldapResponse = await getLdapUsersInGroup(email.configId, email.groupName);
          // Convert usernames to emails
          toEmails = ldapResponse.users.map(username => `${username.toLowerCase()}@aramco.com`);
          //console.log(`Group email: Found ${toEmails.length} recipients for group ${email.groupName}`);
        } catch (ldapError) {
          console.error('LDAP error, falling back to stored users:', ldapError);
          // Fallback to stored users if LDAP fails
          toEmails = email.users ? email.users.map(username => `${username.toLowerCase()}@aramco.com`) : [];
        }
      } else {
        // Fallback to stored users
        toEmails = email.users ? email.users.map(username => `${username.toLowerCase()}@aramco.com`) : [];
      }
    } else {
      // Regular email
      toEmails = processEmailAddresses(email.to);
    }

    if (!toEmails || toEmails.length === 0) {
      throw new Error('No recipients found for email');
    }

    // console.dir({
    //   from: email.from || result.user,
    //   to: toEmails,
    //   cc: processEmailAddresses(email.cc),
    //   bcc: processEmailAddresses(email.bcc),
    //   subject: email.emailSubject,
    //   html: processedHtml,
    //   attachments: attachmentsArray

    // }, { depth: null, color: true })

    await transporter.sendMail({
      from: email.from || result.user,
      to: toEmails,
      cc: processEmailAddresses(email.cc),
      bcc: processEmailAddresses(email.bcc),
      subject: email.emailSubject,
      html: processedHtml,
      attachments: attachmentsArray
    });

    //console.log("Sent email :::", email.emailSubject, "to", toEmails.length, "recipients");

  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
}
