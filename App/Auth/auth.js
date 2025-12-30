import axios from "axios";
import { decodeJwt, SignJWT, generateSecret, EncryptJWT } from "jose";
import { ObjectId } from "mongodb";
import dotenv from 'dotenv';
import ldap from 'ldapjs';
import crypto from 'crypto';
import { connectToMongoDB } from '../../config/connection.js';

const secret = new TextEncoder().encode(process.env.JWT_SECRET);
dotenv.config();

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
      if (err) {
        return reject(err);
      }

      res.on('searchEntry', (entry) => {
        entry.attributes.forEach((attr) => {
          if (attr.type === 'distinguishedName' && attr.vals && attr.vals.length > 0) {
            groupDN = attr.vals[0];
          }
        });
      });

      res.on('error', (err) => {
        reject(err);
      });

      res.on('end', () => {
        if (!groupDN) {
          reject(new Error(`Group not found: ${groupName}`));
        } else {
          console.log(`Found group DN: ${groupDN}`);
          resolve(groupDN);
        }
      });
    });
  });
};

const getMembers = (client, baseDN, groupDN, objectClass) => {
  return new Promise((resolve, reject) => {
    // LDAP filter: Find all objects of specific class that are members of the group
    const filter = `(&(objectClass=${objectClass})(memberOf=${groupDN}))`;
    const searchOptions = {
      filter: filter,
      scope: 'sub',
      attributes: ['sAMAccountName', 'distinguishedName', 'objectGUID'],
      paged: {
        pageSize: 500,
        pagePause: false
      },
      timeLimit: 30
    };

    const members = [];

    client.search(baseDN, searchOptions, (err, res) => {
      if (err) {
        return reject(err);
      }

      res.on('searchEntry', (entry) => {
        const member = {};
        entry.attributes.forEach((attr) => {
          if (attr.vals && attr.vals.length > 0) {
            member[attr.type] = attr.vals.length === 1 ? attr.vals[0] : attr.vals;
          }
        });
        members.push(member);
      });

      res.on('error', (err) => {
        reject(err);
      });

      res.on('end', () => {
        resolve(members);
      });
    });
  });
};

const getUsersRecursively = async (client, baseDN, groupDN, searchedGroups, searchedUsers) => {
  try {
    console.log(`Processing group: ${groupDN}`);

    // Step 1: Find all subgroups (nested groups) - recursively process them first
    const subGroups = await getMembers(client, baseDN, groupDN, 'group');
    console.log(`  Found ${subGroups.length} subgroups`);

    // Step 2: Process each subgroup recursively
    for (const subGroup of subGroups) {
      const subGroupName = subGroup.sAMAccountName;
      const subGroupDN = subGroup.distinguishedName;

      // Skip if already searched (prevent infinite loops)
      if (searchedGroups.has(subGroupName)) {
        console.log(`  Skipping already searched group: ${subGroupName}`);
        continue;
      }

      // Mark this group as searched
      searchedGroups.add(subGroupName);
      console.log(`  Added subgroup to searched list: ${subGroupName}`);

      // Recursively get users from this subgroup
      await getUsersRecursively(client, baseDN, subGroupDN, searchedGroups, searchedUsers);
    }

    // Step 3: Find all direct users in this group
    const users = await getMembers(client, baseDN, groupDN, 'user');
    console.log(`  Found ${users.length} direct users`);

    // Step 4: Add users to the result set (deduplicate automatically with Set)
    for (const user of users) {
      const username = user.sAMAccountName;
      if (username) {
        const upperUsername = username.toUpperCase();
        if (!searchedUsers.has(upperUsername)) {
          searchedUsers.add(upperUsername);
          console.log(`    Added user: ${upperUsername}`);
        }
      }
    }

    return Array.from(searchedUsers).sort();
  } catch (error) {
    console.error(`Error in getUsersRecursively for ${groupDN}:`, error.message);
    throw error;
  }
};

const get_token = async function (req, res, next) {
  // Your existing token logic here
};

const get_ldap_users = async function (req, res, next) {
  try {
    // LDAP Configuration
    const ldapUrl = process.env.LDAP_URL || 'ldap://ldapv01.aramco.com.sa:389';
    const ldapDomain = process.env.LDAP_DOMAIN || 'DC=aramco,DC=com';
    const ldapSearchBase = process.env.LDAP_SEARCH_BASE || 'OU=Corporate Accounts,DC=aramco,DC=com';
    const ldapBindDN = process.env.LDAP_BIND_DN || '';
    const ldapBindPassword = process.env.LDAP_BIND_PASSWORD || '';

    // Create LDAP client
    const client = ldap.createClient({
      url: ldapUrl,
      timeout: 60000,
      connectTimeout: 30000,
      reconnect: false
    });

    client.on('error', (err) => {
      console.error('LDAP connection error:', err);
      if (client) {
        client.unbind();
      }
      return res.status(500).json({
        message: 'LDAP connection error',
        error: err.message
      });
    });

    client.bind(ldapBindDN || '', ldapBindPassword || '', (bindErr) => {
      if (bindErr) {
        console.error('LDAP bind error:', bindErr);
        client.unbind();
        return res.status(500).json({
          message: 'Failed to bind to LDAP server',
          error: bindErr.message
        });
      }

      const searchOptions = {
        filter: '(objectClass=group)',
        scope: 'sub',
        attributes: ['cn', 'distinguishedName', 'member', 'description'],
        paged: {
          pageSize: 500,
          pagePause: false
        },
        sizeLimit: 500,
        timeLimit: 30
      };

      const groups = [];

      client.search(ldapSearchBase, searchOptions, (searchErr, searchRes) => {
        if (searchErr) {
          console.error('LDAP search error:', searchErr);
          client.unbind();
          return res.status(500).json({
            message: 'Failed to search LDAP',
            error: searchErr.message
          });
        }

        searchRes.on('searchEntry', (entry) => {
          const group = {
            dn: entry.dn.toString(),
            attributes: {}
          };

          entry.attributes.forEach((attr) => {
            if (attr.vals && attr.vals.length > 0) {
              group.attributes[attr.type] = attr.vals.length === 1 ? attr.vals[0] : attr.vals;
            }
          });

          groups.push(group);
        });

        searchRes.on('error', (err) => {
          console.error('LDAP search result error:', err);
          client.unbind();

          if (err.name === 'TimeLimitExceededError') {
            return res.status(200).json({
              message: 'Partial results - time limit exceeded',
              count: groups.length,
              groups: groups,
              partial: true
            });
          }

          return res.status(500).json({
            message: 'Error during LDAP search',
            error: err.message
          });
        });

        searchRes.on('end', (result) => {
          console.log(`Search complete. Found ${groups.length} groups`);
          client.unbind();
          return res.status(200).json({
            message: 'Successfully fetched groups from LDAP',
            count: groups.length,
            groups: groups
          });
        });
      });
    });
  } catch (error) {
    console.error('Error fetching LDAP groups:', error);
    return res.status(500).json({
      message: 'Internal Server Error',
      error: error.message
    });
  }
};

const get_ldap_users_in_group = async function (req, res, next) {
  let client = null;

  try { 
    const configId = req.body.configId;

    if (!configId) {
      return res.status(400).json({
        message: "config is required"
      });
    }

    const db = await connectToMongoDB();
    const config = await db.collection(process.env.CONFIG_COLLECTION).findOne({ _id: new ObjectId(configId) });

    if (!config) {
      return res.status(404).json({
        message: "Config not found"
      });
    }

    let configValues = {};
    try {
      configValues = JSON.parse(config.configValue);
    } catch (err) {
      return res.status(500).json({
        message: "Invalid JSON in config.configValue",
        error: err.message
      });
    }

    const ldapUrl = configValues.LDAP_URL || process.env.LDAP_URL;
    const ldapSearchBase = configValues.LDAP_SEARCH_BASE || process.env.LDAP_SEARCH_BASE;
    const ldapBindDN = configValues.LDAP_BIND_DN || process.env.LDAP_BIND_DN || '';
    const ldapBindPassword = configValues.LDAP_BIND_PASSWORD || process.env.LDAP_BIND_PASSWORD || '';

    // Extract and decrypt LDAP_USERNAME and LDAP_PCODE if encrypted
    let ldapUsername = configValues.LDAP_USERNAME || process.env.LDAP_USERNAME || '';
    let ldapPcode = configValues.LDAP_PCODE || process.env.LDAP_PCODE || '';

    // Decrypt LDAP_USERNAME if it's encrypted (contains ':')
    if (ldapUsername && ldapUsername.includes(':')) {
      try {
        const algorithm = 'aes-256-cbc';
        const secretKey = process.env.ENCRYPTION_KEY || 'default-secret-key-32-characters!';
        const key = crypto.scryptSync(secretKey, 'salt', 32);
        const parts = ldapUsername.split(':');
        if (parts.length === 2) {
          const iv = Buffer.from(parts[0], 'hex');
          const encrypted = parts[1];
          const decipher = crypto.createDecipheriv(algorithm, key, iv);
          let decrypted = decipher.update(encrypted, 'hex', 'utf8');
          decrypted += decipher.final('utf8');
          ldapUsername = decrypted;
        }
      } catch (err) {
        console.error('Failed to decrypt LDAP_USERNAME:', err.message);
      }
    }

    // Decrypt LDAP_PCODE if it's encrypted (contains ':')
    if (ldapPcode && ldapPcode.includes(':')) {
      try {
        const algorithm = 'aes-256-cbc';
        const secretKey = process.env.ENCRYPTION_KEY || 'default-secret-key-32-characters!';
        const key = crypto.scryptSync(secretKey, 'salt', 32);
        const parts = ldapPcode.split(':');
        if (parts.length === 2) {
          const iv = Buffer.from(parts[0], 'hex');
          const encrypted = parts[1];
          const decipher = crypto.createDecipheriv(algorithm, key, iv);
          let decrypted = decipher.update(encrypted, 'hex', 'utf8');
          decrypted += decipher.final('utf8');
          ldapPcode = decrypted;
        }
      } catch (err) {
        console.error('Failed to decrypt LDAP_PCODE:', err.message);
      }
    }

    console.log("user name: "+ldapUsername);
    console.log( "passcode: "+ldapPcode);


    // Get group name from request body or query
    const groupName = req.body.groupName || req.query.groupName;

    if (!groupName) {
      return res.status(400).json({
        message: 'Group name is required',
        error: 'Please provide groupName in request body or query parameter'
      });
    }

    console.log(`Starting recursive user search for group: ${groupName}`);

    // Create LDAP client
    client = ldap.createClient({
      url: ldapUrl,
      timeout: 60000,
      connectTimeout: 30000,
      reconnect: false
    });

    // Bind to LDAP
    await new Promise((resolve, reject) => {
      client.bind(ldapBindDN || '', ldapBindPassword || '', (err) => {
        if (err) {
          console.error('LDAP bind error:', err);
          return reject(err);
        }
        console.log('Successfully bound to LDAP server');
        resolve();
      });
    });

    // Step 1: Get the group's Distinguished Name
    const groupDN = await getGroupDN(client, ldapSearchBase, groupName);

    // Step 2: Initialize tracking sets (like Java's LinkedList)
    const searchedGroups = new Set();
    const searchedUsers = new Set();

    // Step 3: Get all users recursively
    console.log(`\nStarting recursive search...`);
    await getUsersRecursively(client, ldapSearchBase, groupDN, searchedGroups, searchedUsers);

    // Step 4: Convert Set to sorted array
    const users = Array.from(searchedUsers).sort();

    console.log(`\n========================================`);
    console.log(`Recursive search complete!`);
    console.log(`Total users found: ${users.length}`);
    console.log(`Total nested groups processed: ${searchedGroups.size}`);
    console.log(`========================================\n`);

    // Close connection
    client.unbind();

    // Return results
    return res.status(200).json({
      message: 'Successfully fetched users from LDAP group (recursive)',
      groupName: groupName,
      groupDN: groupDN,
      userCount: users.length,
      nestedGroupsCount: searchedGroups.size,
      users: users,
      nestedGroups: Array.from(searchedGroups).sort()
    });

  } catch (error) {
    console.error('Error fetching LDAP group users:', error);

    if (client) {
      try {
        client.unbind();
      } catch (unbindError) {
        console.error('Error unbinding client:', unbindError);
      }
    }

    return res.status(500).json({
      message: 'Error fetching LDAP group users',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Get users from multiple groups matching a pattern (with wildcard support)
 * Supports patterns like "MA-EMBS*" to match multiple groups
 */
const get_ldap_users_by_pattern = async function (req, res, next) {
  let client = null;

  try {
    const ldapUrl = process.env.LDAP_URL || 'ldap://ldapv01.aramco.com.sa:389';
    const ldapSearchBase = process.env.LDAP_SEARCH_BASE || 'DC=aramco,DC=com';
    const ldapBindDN = process.env.LDAP_BIND_DN || '';
    const ldapBindPassword = process.env.LDAP_BIND_PASSWORD || '';

    // Get group pattern from request body or query
    const groupPattern = req.body.groupPattern || req.query.groupPattern || 'MA-EMBS*';

    console.log(`\n========================================`);
    console.log(`Searching for groups matching pattern: ${groupPattern}`);
    console.log(`========================================\n`);

    client = ldap.createClient({
      url: ldapUrl,
      timeout: 60000,
      connectTimeout: 30000,
      reconnect: false
    });

    await new Promise((resolve, reject) => {
      client.bind(ldapBindDN || '', ldapBindPassword || '', (err) => {
        if (err) return reject(err);
        console.log('Successfully bound to LDAP server');
        resolve();
      });
    });

    // Find all groups matching the pattern
    const groups = await new Promise((resolve, reject) => {
      const filter = `(&(objectClass=group)(cn=${groupPattern}))`;
      const searchOptions = {
        filter: filter,
        scope: 'sub',
        attributes: ['cn', 'distinguishedName', 'description'],
        paged: { pageSize: 100 },
        timeLimit: 30
      };

      const matchedGroups = [];

      client.search(ldapSearchBase, searchOptions, (err, searchRes) => {
        if (err) return reject(err);

        searchRes.on('searchEntry', (entry) => {
          const group = {};
          entry.attributes.forEach((attr) => {
            if (attr.vals && attr.vals.length > 0) {
              group[attr.type] = attr.vals[0];
            }
          });
          matchedGroups.push(group);
        });

        searchRes.on('error', reject);
        searchRes.on('end', () => resolve(matchedGroups));
      });
    });

    console.log(`Found ${groups.length} groups matching pattern\n`);

    if (groups.length === 0) {
      client.unbind();
      return res.status(404).json({
        message: `No groups found matching pattern: ${groupPattern}`,
        groupPattern: groupPattern,
        matchedGroupsCount: 0
      });
    }

    // Get users from all matched groups
    const allUsers = new Set();
    const allNestedGroups = new Set();
    const groupDetails = [];

    for (const group of groups) {
      console.log(`Processing group: ${group.cn}`);
      const searchedGroups = new Set();
      const searchedUsers = new Set();

      try {
        await getUsersRecursively(client, ldapSearchBase, group.distinguishedName, searchedGroups, searchedUsers);

        // Merge results
        searchedUsers.forEach(user => allUsers.add(user));
        searchedGroups.forEach(g => allNestedGroups.add(g));

        groupDetails.push({
          name: group.cn,
          dn: group.distinguishedName,
          description: group.description,
          userCount: searchedUsers.size,
          nestedGroupCount: searchedGroups.size
        });

        console.log(`  - Users in this group: ${searchedUsers.size}`);
        console.log(`  - Nested groups: ${searchedGroups.size}\n`);
      } catch (err) {
        console.error(`Error processing group ${group.cn}:`, err);
        groupDetails.push({
          name: group.cn,
          dn: group.distinguishedName,
          error: err.message
        });
      }
    }

    client.unbind();

    const sortedUsers = Array.from(allUsers).sort();

    console.log(`Groups matched: ${groups.length}`);
    console.log(`Total unique users: ${sortedUsers.length}`);
    console.log(`Total nested groups: ${allNestedGroups.size}`);

    return res.status(200).json({
      message: 'Successfully fetched users from matching LDAP groups',
      groupPattern: groupPattern,
      matchedGroupsCount: groups.length,
      totalUsersCount: sortedUsers.length,
      totalNestedGroupsCount: allNestedGroups.size,
      groups: groupDetails,
      users: sortedUsers,
      nestedGroups: Array.from(allNestedGroups).sort()
    });

  } catch (error) {
    console.error('Error fetching LDAP users by pattern:', error);

    if (client) {
      try {
        client.unbind();
      } catch (unbindError) {
        console.error('Error unbinding client:', unbindError);
      }
    }

    return res.status(500).json({
      message: 'Error fetching LDAP users by pattern',
      error: error.message
    });
  }
};

const get_ldap_group_members = async function (req, res, next) {
  try {
    // LDAP Configuration
    const ldapUrl = process.env.LDAP_URL || 'ldap://ldapv01.aramco.com.sa:389';
    const ldapDomain = process.env.LDAP_DOMAIN || 'DC=aramco,DC=com';
    const ldapSearchBase = process.env.LDAP_SEARCH_BASE || 'OU=groups,OU=SunLDAP,OU=Corporate Accounts,DC=aramco,DC=com';
    const ldapBindDN = process.env.LDAP_BIND_DN || '';
    const ldapBindPassword = process.env.LDAP_BIND_PASSWORD || '';

    // Group pattern to search for
    const groupPattern = req.body.groupPattern || req.query.groupPattern || 'MA-EMBS*';

    // Create LDAP client
    const client = ldap.createClient({
      url: ldapUrl,
      timeout: 60000,
      connectTimeout: 30000,
      reconnect: false
    });

    client.on('error', (err) => {
      console.error('LDAP connection error:', err);
      if (client) {
        client.unbind();
      }
      return res.status(500).json({
        message: 'LDAP connection error',
        error: err.message
      });
    });

    client.bind(ldapBindDN || '', ldapBindPassword || '', (bindErr) => {
      if (bindErr) {
        console.error('LDAP bind error:', bindErr);
        client.unbind();
        return res.status(500).json({
          message: 'Failed to bind to LDAP server',
          error: bindErr.message
        });
      }

      // Search for groups matching the pattern
      const searchOptions = {
        filter: `(&(objectClass=group)(cn=${groupPattern}))`,
        scope: 'sub',
        attributes: ['cn', 'distinguishedName', 'member', 'description'],
        paged: {
          pageSize: 100,
          pagePause: false
        },
        sizeLimit: 100,
        timeLimit: 30
      };

      const groups = [];

      client.search(ldapSearchBase, searchOptions, (searchErr, searchRes) => {
        if (searchErr) {
          console.error('LDAP search error:', searchErr);
          client.unbind();
          return res.status(500).json({
            message: 'Failed to search LDAP',
            error: searchErr.message
          });
        }

        searchRes.on('searchEntry', (entry) => {
          const group = {
            dn: entry.dn.toString(),
            attributes: {}
          };

          entry.attributes.forEach((attr) => {
            if (attr.vals && attr.vals.length > 0) {
              group.attributes[attr.type] = attr.vals.length === 1 ? attr.vals[0] : attr.vals;
            }
          });

          groups.push(group);
        });

        searchRes.on('error', (err) => {
          console.error('LDAP search result error:', err);
          client.unbind();

          if (err.name === 'TimeLimitExceededError') {
            return res.status(200).json({
              message: 'Partial results - time limit exceeded',
              count: groups.length,
              groups: groups,
              partial: true
            });
          }

          return res.status(500).json({
            message: 'Error during LDAP search',
            error: err.message
          });
        });

        searchRes.on('end', async (result) => {
          console.log(`Search complete. Found ${groups.length} groups matching ${groupPattern}`);

          if (groups.length === 0) {
            client.unbind();
            return res.status(404).json({
              message: `No groups found matching pattern: ${groupPattern}`,
              count: 0,
              groups: []
            });
          }

          // Extract all unique member DNs
          const allMembers = [];
          const memberDNs = new Set();

          groups.forEach(group => {
            if (group.attributes.member) {
              const members = Array.isArray(group.attributes.member)
                ? group.attributes.member
                : [group.attributes.member];

              members.forEach(memberDN => {
                memberDNs.add(memberDN);
              });
            }
          });

          console.log(`Found ${memberDNs.size} unique members across ${groups.length} groups`);

          // If no members found
          if (memberDNs.size === 0) {
            client.unbind();
            return res.status(200).json({
              message: 'Groups found but no members',
              groupCount: groups.length,
              memberCount: 0,
              groups: groups.map(g => ({
                name: g.attributes.cn,
                dn: g.dn,
                description: g.attributes.description
              })),
              members: []
            });
          }

          // Fetch user details for each member
          let processedCount = 0;
          const errors = [];

          for (const memberDN of memberDNs) {
            try {
              const userSearchOptions = {
                filter: '(objectClass=*)',
                scope: 'base',
                attributes: ['cn', 'sAMAccountName', 'mail', 'displayName', 'distinguishedName', 'memberOf']
              };

              await new Promise((resolve, reject) => {
                client.search(memberDN, userSearchOptions, (userSearchErr, userSearchRes) => {
                  if (userSearchErr) {
                    errors.push({ dn: memberDN, error: userSearchErr.message });
                    resolve();
                    return;
                  }

                  userSearchRes.on('searchEntry', (entry) => {
                    const user = {
                      dn: entry.dn.toString(),
                      attributes: {}
                    };

                    entry.attributes.forEach((attr) => {
                      if (attr.vals && attr.vals.length > 0) {
                        user.attributes[attr.type] = attr.vals.length === 1 ? attr.vals[0] : attr.vals;
                      }
                    });

                    allMembers.push(user);
                  });

                  userSearchRes.on('error', (err) => {
                    errors.push({ dn: memberDN, error: err.message });
                    resolve();
                  });

                  userSearchRes.on('end', () => {
                    processedCount++;
                    resolve();
                  });
                });
              });
            } catch (err) {
              errors.push({ dn: memberDN, error: err.message });
            }
          }

          client.unbind();

          console.log(`Processed ${processedCount}/${memberDNs.size} members. Retrieved ${allMembers.length} user details.`);

          return res.status(200).json({
            message: 'Successfully fetched group members',
            groupPattern: groupPattern,
            groupCount: groups.length,
            memberCount: allMembers.length,
            groups: groups.map(g => ({
              name: g.attributes.cn,
              dn: g.dn,
              description: g.attributes.description,
              memberCount: Array.isArray(g.attributes.member) ? g.attributes.member.length : (g.attributes.member ? 1 : 0)
            })),
            members: allMembers,
            errors: errors.length > 0 ? errors : undefined
          });
        });
      });
    });
  } catch (error) {
    console.error('Error fetching LDAP group members:', error);
    return res.status(500).json({
      message: 'Internal Server Error',
      error: error.message
    });
  }
};

const check_ldap_connection = async function (req, res, next) {
  let client = null;
  let connectionStatus = 'not_connected';
  try {
    // LDAP Configuration
    const ldapUrl = process.env.LDAP_URL || 'ldap://ldapv01.aramco.com.sa:389';
    const ldapDomain = process.env.LDAP_DOMAIN || 'DC=aramco,DC=com';
    const ldapBindDN = process.env.LDAP_BIND_DN || '';
    const ldapBindPassword = process.env.LDAP_BIND_PASSWORD || '';

    // Create LDAP client
    client = ldap.createClient({
      url: ldapUrl,
      timeout: 5000,
      connectTimeout: 10000,
      reconnect: false
    });

    // Handle connection errors
    client.on('error', (err) => {
      console.error('LDAP connection error:', err);
      connectionStatus = 'connection_failed';
    });

    // Wrap bind operation in a promise to check connection
    const bindPromise = new Promise((resolve, reject) => {
      // Set timeout for bind operation
      const bindTimeout = setTimeout(() => {
        reject(new Error('LDAP bind timeout - connection may not be established'));
      }, 10000);

      // Attempt to bind (this will establish connection)
      client.bind(ldapBindDN || '', ldapBindPassword || '', (bindErr) => {
        clearTimeout(bindTimeout);
        if (bindErr) {
          connectionStatus = 'connected_but_bind_failed';
          reject(bindErr);
        } else {
          connectionStatus = 'connected_and_bound';
          console.log('LDAP connection check: Connection established and bind successful');
          resolve(true);
        }
      });
    });

    // Wait for connection and bind
    try {
      await bindPromise;
      if (client) {
        client.unbind();
      }
      return res.status(200).json({
        message: 'LDAP connection successful',
        connectionStatus: connectionStatus,
        server: ldapUrl,
        timestamp: new Date().toISOString()
      });
    } catch (bindErr) {
      console.error('LDAP connection check failed:', bindErr);
      if (client) {
        try {
          client.unbind();
        } catch (unbindErr) {
          // Ignore unbind errors
        }
      }
      return res.status(500).json({
        message: 'LDAP connection check failed',
        error: bindErr.message,
        connectionStatus: connectionStatus,
        server: ldapUrl
      });
    }
  } catch (error) {
    console.error('Error checking LDAP connection:', error);
    if (client) {
      try {
        client.unbind();
      } catch (unbindErr) {
        // Ignore unbind errors
      }
    }
    return res.status(500).json({
      message: 'Internal Server Error',
      error: error.message,
      connectionStatus: connectionStatus
    });
  }
};

const check_user_in_group = async function (req, res, next) {
  let client = null;

  try {
    const ldapUrl = process.env.LDAP_URL || 'ldap://ldapv01.aramco.com.sa:389';
    const ldapSearchBase = process.env.LDAP_SEARCH_BASE || 'DC=aramco,DC=com';
    const ldapBindDN = process.env.LDAP_BIND_DN || '';
    const ldapBindPassword = process.env.LDAP_BIND_PASSWORD || '';

    // Get username and groupName from request body
    const { username, groupName } = req.body;

    if (!username || !groupName) {
      return res.status(400).json({
        message: 'Both username and groupName are required',
        error: 'Please provide username and groupName in request body'
      });
    }

    console.log(`\nChecking if user '${username}' is in group '${groupName}'...`);

    client = ldap.createClient({
      url: ldapUrl,
      timeout: 60000,
      connectTimeout: 30000,
      reconnect: false
    });

    // Bind to LDAP
    await new Promise((resolve, reject) => {
      client.bind(ldapBindDN || '', ldapBindPassword || '', (err) => {
        if (err) {
          console.error('LDAP bind error:', err);
          return reject(err);
        }
        resolve();
      });
    });

    // Step 1: Get the group's Distinguished Name
    const groupDN = await getGroupDN(client, ldapSearchBase, groupName);

    // Step 2: Get all users in the group recursively
    const searchedGroups = new Set();
    const searchedUsers = new Set();

    await getUsersRecursively(client, ldapSearchBase, groupDN, searchedGroups, searchedUsers);

    // Step 3: Check if user is in the list (case-insensitive)
    const upperUsername = username.toUpperCase();
    const isMember = searchedUsers.has(upperUsername);

    client.unbind();

    console.log(`Result: User '${username}' ${isMember ? 'IS' : 'IS NOT'} a member of group '${groupName}'`);

    return res.status(200).json({
      message: isMember
        ? `User '${username}' is a member of group '${groupName}'`
        : `User '${username}' is NOT a member of group '${groupName}'`,
      username: username,
      groupName: groupName,
      groupDN: groupDN,
      isMember: isMember,
      totalUsersInGroup: searchedUsers.size,
      nestedGroupsChecked: searchedGroups.size
    });

  } catch (error) {
    console.error('Error checking user in group:', error);

    if (client) {
      try {
        client.unbind();
      } catch (unbindError) {
        console.error('Error unbinding client:', unbindError);
      }
    }

    return res.status(500).json({
      message: 'Error checking user membership',
      error: error.message
    });
  }
};

const get_all_ldap_groups = async function (req, res, next) {
  let client = null;

  try {
    const ldapUrl = process.env.LDAP_URL || 'ldap://ldapv01.aramco.com.sa:389';
    const ldapSearchBase = process.env.LDAP_SEARCH_BASE || 'DC=aramco,DC=com';
    const ldapBindDN = process.env.LDAP_BIND_DN || '';
    const ldapBindPassword = process.env.LDAP_BIND_PASSWORD || '';

    console.log('\n========================================');
    console.log('Fetching all LDAP groups...');
    console.log('========================================\n');

    client = ldap.createClient({
      url: ldapUrl,
      timeout: 60000,
      connectTimeout: 30000,
      reconnect: false
    });

    // Bind to LDAP
    await new Promise((resolve, reject) => {
      client.bind(ldapBindDN || '', ldapBindPassword || '', (err) => {
        if (err) {
          console.error('LDAP bind error:', err);
          return reject(err);
        }
        console.log('Successfully bound to LDAP server');
        resolve();
      });
    });

    // Search for all groups
    const groups = await new Promise((resolve, reject) => {
      const filter = '(objectClass=group)';
      const searchOptions = {
        filter: filter,
        scope: 'sub',
        attributes: ['cn', 'distinguishedName', 'description', 'memberOf'],
        paged: {
          pageSize: 1000,
          pagePause: false
        },
        timeLimit: 60
      };

      const allGroups = [];

      client.search(ldapSearchBase, searchOptions, (err, searchRes) => {
        if (err) return reject(err);

        searchRes.on('searchEntry', (entry) => {
          const group = {};
          entry.attributes.forEach((attr) => {
            if (attr.vals && attr.vals.length > 0) {
              group[attr.type] = attr.vals.length === 1 ? attr.vals[0] : attr.vals;
            }
          });
          allGroups.push(group);
        });

        searchRes.on('error', (err) => {
          if (err.name === 'SizeLimitExceededError') {
            console.log('Size limit exceeded, returning partial results');
            resolve(allGroups);
          } else {
            reject(err);
          }
        });

        searchRes.on('end', () => {
          console.log(`Found ${allGroups.length} groups`);
          resolve(allGroups);
        });
      });
    });

    client.unbind();

    // Format response
    const formattedGroups = groups.map(group => ({
      name: group.cn,
      dn: group.distinguishedName,
      description: group.description || null
    })).sort((a, b) => a.name.localeCompare(b.name));

    console.log(`\nTotal groups retrieved: ${formattedGroups.length}\n`);

    return res.status(200).json({
      message: 'Successfully fetched all LDAP groups',
      totalCount: formattedGroups.length,
      groups: formattedGroups
    });

  } catch (error) {
    console.error('Error fetching all LDAP groups:', error);

    if (client) {
      try {
        client.unbind();
      } catch (unbindError) {
        console.error('Error unbinding client:', unbindError);
      }
    }

    return res.status(500).json({
      message: 'Error fetching all LDAP groups',
      error: error.message
    });
  }
};

/**
 * Add a user to an LDAP group
 */
const add_user_to_group = async function (req, res, next) {
  let client = null;

  try {
    const configId = req.body.configId;

    if (!configId) {
      return res.status(400).json({
        message: "config is required"
      });
    }

    const db = await connectToMongoDB();
    const config = await db.collection(process.env.CONFIG_COLLECTION).findOne({ _id: new ObjectId(configId) });

    if (!config) {
      return res.status(404).json({
        message: "Config not found"
      });
    }

    let configValues = {};
    try {
      configValues = JSON.parse(config.configValue);
    } catch (err) {
      return res.status(500).json({
        message: "Invalid JSON in config.configValue",
        error: err.message
      });
    }
    
    const ldapUrl = configValues.LDAP_URL || process.env.LDAP_URL;
    const ldapSearchBase = configValues.LDAP_SEARCH_BASE || process.env.LDAP_SEARCH_BASE;
    const ldapBindDN = configValues.LDAP_BIND_DN || process.env.LDAP_BIND_DN || '';
    const ldapBindPassword = configValues.LDAP_BIND_PASSWORD || process.env.LDAP_BIND_PASSWORD || '';

    const groupName = req.body.groupName;
    const username = req.body.username;

    if (!groupName || !username) {
      return res.status(400).json({
        message: 'Group name and username are required',
        error: 'Please provide groupName and username in request body'
      });
    }

    console.log(`Adding user '${username}' to group: ${groupName}`);

    client = ldap.createClient({
      url: ldapUrl,
      timeout: 60000,
      connectTimeout: 30000,
      reconnect: false
    });

    await new Promise((resolve, reject) => {
      client.bind(ldapBindDN || '', ldapBindPassword || '', (err) => {
        if (err) {
          console.error('LDAP bind error:', err);
          return reject(err);
        }
        console.log('Successfully bound to LDAP server');
        resolve();
      });
    });

    const groupDN = await getGroupDN(client, ldapSearchBase, groupName);

    const userDN = await new Promise((resolve, reject) => {
      const filter = `(&(objectClass=user)(sAMAccountName=${username}))`;
      const searchOptions = {
        filter: filter,
        scope: 'sub',
        attributes: ['distinguishedName'],
        sizeLimit: 1,
        timeLimit: 30
      };

      let userDN = null;

      client.search(ldapSearchBase, searchOptions, (err, res) => {
        if (err) {
          return reject(err);
        }

        res.on('searchEntry', (entry) => {
          entry.attributes.forEach((attr) => {
            if (attr.type === 'distinguishedName' && attr.vals && attr.vals.length > 0) {
              userDN = attr.vals[0];
            }
          });
        });

        res.on('error', (err) => {
          reject(err);
        });

        res.on('end', () => {
          if (!userDN) {
            reject(new Error(`User not found: ${username}`));
          } else {
            console.log(`Found user DN: ${userDN}`);
            resolve(userDN);
          }
        });
      });
    });

    await new Promise((resolve, reject) => {
      const change = new ldap.Change({
        operation: 'add',
        modification: {
          member: userDN
        }
      });

      client.modify(groupDN, change, (err) => {
        if (err) {
          if (err.message && err.message.includes('ENTRY_ALREADY_EXISTS')) {
            console.log(`User '${username}' is already a member of group '${groupName}'`);
            return resolve({ alreadyMember: true });
          }
          console.error('Error adding user to group:', err);
          return reject(err);
        }
        console.log(`Successfully added user '${username}' to group '${groupName}'`);
        resolve({ alreadyMember: false });
      });
    });

    client.unbind();

    return res.status(200).json({
      message: `Successfully added user '${username}' to group '${groupName}'`,
      username: username,
      userDN: userDN,
      groupName: groupName,
      groupDN: groupDN,
      success: true
    });

  } catch (error) {
    console.error('Error adding user to group:', error);

    if (client) {
      try {
        client.unbind();
      } catch (unbindError) {
        console.error('Error unbinding client:', unbindError);
      }
    }

    return res.status(500).json({
      message: 'Error adding user to group',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Remove a user from an LDAP group
 */
const delete_user_from_group = async function (req, res, next) {
  let client = null;

  try {
    const configId = req.body.configId;

    if (!configId) {
      return res.status(400).json({
        message: "config is required"
      });
    }

    const db = await connectToMongoDB();
    const config = await db.collection(process.env.CONFIG_COLLECTION).findOne({ _id: new ObjectId(configId) });

    if (!config) {
      return res.status(404).json({
        message: "Config not found"
      });
    }

    let configValues = {};
    try {
      configValues = JSON.parse(config.configValue);
    } catch (err) {
      return res.status(500).json({
        message: "Invalid JSON in config.configValue",
        error: err.message
      });
    }
    
    const ldapUrl = configValues.LDAP_URL || process.env.LDAP_URL;
    const ldapSearchBase = configValues.LDAP_SEARCH_BASE || process.env.LDAP_SEARCH_BASE;
    const ldapBindDN = configValues.LDAP_BIND_DN || process.env.LDAP_BIND_DN || '';
    const ldapBindPassword = configValues.LDAP_BIND_PASSWORD || process.env.LDAP_BIND_PASSWORD || '';

    const groupName = req.body.groupName;
    const username = req.body.username;

    if (!groupName || !username) {
      return res.status(400).json({
        message: 'Group name and username are required',
        error: 'Please provide groupName and username in request body'
      });
    }

    console.log(`Removing user '${username}' from group: ${groupName}`);

    client = ldap.createClient({
      url: ldapUrl,
      timeout: 60000,
      connectTimeout: 30000,
      reconnect: false
    });

    await new Promise((resolve, reject) => {
      client.bind(ldapBindDN || '', ldapBindPassword || '', (err) => {
        if (err) {
          console.error('LDAP bind error:', err);
          return reject(err);
        }
        console.log('Successfully bound to LDAP server');
        resolve();
      });
    });

    const groupDN = await getGroupDN(client, ldapSearchBase, groupName);

    const userDN = await new Promise((resolve, reject) => {
      const filter = `(&(objectClass=user)(sAMAccountName=${username}))`;
      const searchOptions = {
        filter: filter,
        scope: 'sub',
        attributes: ['distinguishedName'],
        sizeLimit: 1,
        timeLimit: 30
      };

      let userDN = null;

      client.search(ldapSearchBase, searchOptions, (err, res) => {
        if (err) {
          return reject(err);
        }

        res.on('searchEntry', (entry) => {
          entry.attributes.forEach((attr) => {
            if (attr.type === 'distinguishedName' && attr.vals && attr.vals.length > 0) {
              userDN = attr.vals[0];
            }
          });
        });

        res.on('error', (err) => {
          reject(err);
        });

        res.on('end', () => {
          if (!userDN) {
            reject(new Error(`User not found: ${username}`));
          } else {
            console.log(`Found user DN: ${userDN}`);
            resolve(userDN);
          }
        });
      });
    });

    await new Promise((resolve, reject) => {
      const change = new ldap.Change({
        operation: 'delete',
        modification: {
          member: userDN
        }
      });

      client.modify(groupDN, change, (err) => {
        if (err) {
          if (err.message && err.message.includes('NO_SUCH_ATTRIBUTE')) {
            console.log(`User '${username}' is not a member of group '${groupName}'`);
            return resolve({ notMember: true });
          }
          console.error('Error removing user from group:', err);
          return reject(err);
        }
        console.log(`Successfully removed user '${username}' from group '${groupName}'`);
        resolve({ notMember: false });
      });
    });

    client.unbind();

    return res.status(200).json({
      message: `Successfully removed user '${username}' from group '${groupName}'`,
      username: username,
      userDN: userDN,
      groupName: groupName,
      groupDN: groupDN,
      success: true
    });

  } catch (error) {
    console.error('Error removing user from group:', error);

    if (client) {
      try {
        client.unbind();
      } catch (unbindError) {
        console.error('Error unbinding client:', unbindError);
      }
    }

    return res.status(500).json({
      message: 'Error removing user from group',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export default {
  get_token,
  get_ldap_users,
  check_ldap_connection,
  get_ldap_group_members,
  get_ldap_users_in_group,
  get_ldap_users_by_pattern,
  check_user_in_group,
  get_all_ldap_groups,
  add_user_to_group,
  delete_user_from_group
};