const { BRAND_COLORS, LOGO_URL, EMAIL_DOMAIN } = require('./emailConstants');
const { getFrontendUrl } = require('../helpers');

/**
 * Create Outlook-compatible email button
 */
const createEmailButton = (href, text, primaryColor = BRAND_COLORS.primary, primaryLight = BRAND_COLORS.primaryLight) => {
  return `
    <div style="text-align: center; margin: 45px 0;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:55px;v-text-anchor:middle;width:250px;" arcsize="15%" stroke="f" fillcolor="${primaryColor}">
        <w:anchorlock/>
        <center style="color:${BRAND_COLORS.white};font-family:sans-serif;font-size:17px;font-weight:600;">${text}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
        <tr>
          <td style="background: ${primaryColor}; border-radius: 12px; padding: 0;">
            <a href="${href}" 
               style="display: inline-block; background: linear-gradient(135deg, ${primaryColor} 0%, ${primaryLight} 100%); background-color: ${primaryColor}; color: ${BRAND_COLORS.white}; padding: 18px 50px; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 17px; box-shadow: 0 8px 20px ${primaryColor}40; -webkit-text-size-adjust: none; mso-hide: all;">
              ${text}
            </a>
          </td>
        </tr>
      </table>
      <!--<![endif]-->
    </div>
  `;
};

/**
 * Create email wrapper with consistent branding
 */
const createEmailWrapper = (content, primaryColorOverride = null) => {
  const primaryColor = primaryColorOverride || BRAND_COLORS.primary;
  const primaryLight = primaryColorOverride || BRAND_COLORS.primaryLight;
  const primaryDark = primaryColorOverride || BRAND_COLORS.primaryDark;
  const frontendUrl = getFrontendUrl();
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Freshlancer</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif; background: linear-gradient(135deg, ${primaryColor}08 0%, ${primaryLight}05 100%);">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: linear-gradient(135deg, ${primaryColor}08 0%, ${primaryLight}05 100%);">
        <tr>
          <td align="center" style="padding: 50px 20px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: ${BRAND_COLORS.white}; border-radius: 20px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1); overflow: hidden;">
              <!-- Elegant Header -->
              <tr>
                <td style="background: linear-gradient(135deg, ${primaryColor} 0%, ${primaryLight} 50%, ${primaryDark} 100%); padding: 50px 40px; text-align: center; position: relative;">
                  <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: url('data:image/svg+xml,%3Csvg width=\\'60\\' height=\\'60\\' viewBox=\\'0 0 60 60\\' xmlns=\\'http://www.w3.org/2000/svg\\'%3E%3Cg fill=\\'none\\' fill-rule=\\'evenodd\\'%3E%3Cg fill=\\'%23ffffff\\' fill-opacity=\\'0.1\\'%3E%3Cpath d=\\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E') repeat; opacity: 0.3;"></div>
                  <div style="position: relative; z-index: 1;">
                    <img src="${LOGO_URL}" alt="Freshlancer Logo" style="max-width: 220px; height: auto; margin-bottom: 20px; filter: brightness(0) invert(1);" />
                    <div style="height: 4px; background: linear-gradient(90deg, transparent, ${BRAND_COLORS.white}40, transparent); margin-top: 25px; border-radius: 2px;"></div>
                  </div>
                </td>
              </tr>
              <!-- Content -->
              <tr>
                <td style="padding: 50px 40px;">
                  ${content}
                </td>
              </tr>
              <!-- Elegant Footer -->
              <tr>
                <td style="background-color: ${BRAND_COLORS.white}; padding: 40px; text-align: center; border-top: 1px solid ${primaryColor}15;">
                  <p style="margin: 0 0 12px 0; color: ${primaryColor}; font-size: 16px; font-weight: 600; line-height: 1.6;">
                    Freshlancer
                  </p>
                  <p style="margin: 0 0 20px 0; color: ${BRAND_COLORS.textLight}; font-size: 14px; line-height: 1.6;">
                    Connecting Talented Students with Global Opportunities
                  </p>
                  <div style="border-top: 1px solid ${primaryColor}15; padding-top: 25px; margin-top: 25px;">
                    <p style="margin: 0 0 15px 0; color: ${BRAND_COLORS.textLight}; font-size: 12px;">
                      © ${new Date().getFullYear()} Freshlancer. All rights reserved.
                    </p>
                    <p style="margin: 0; color: ${BRAND_COLORS.textLight}; font-size: 13px;">
                      <a href="${frontendUrl}" style="color: ${primaryColor}; text-decoration: none; font-weight: 500; margin: 0 10px;">Visit Website</a>
                      <span style="color: ${primaryColor}40;">|</span>
                      <a href="mailto:support@${EMAIL_DOMAIN}" style="color: ${primaryColor}; text-decoration: none; font-weight: 500; margin: 0 10px;">Support</a>
                    </p>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

/**
 * Create email header section
 */
const createHeader = (title) => {
  return `
    <div style="text-align: center; margin-bottom: 40px;">
      <h1 style="color: ${BRAND_COLORS.primary}; font-size: 32px; font-weight: 700; margin: 0 0 15px 0; line-height: 1.2; letter-spacing: -0.5px;">
        ${title}
      </h1>
      <div style="width: 60px; height: 4px; background: linear-gradient(90deg, ${BRAND_COLORS.primary}, ${BRAND_COLORS.primaryLight}); margin: 0 auto; border-radius: 2px;"></div>
    </div>
  `;
};

/**
 * Create greeting paragraph
 */
const createGreeting = (name) => {
  return `
    <p style="color: ${BRAND_COLORS.text}; font-size: 18px; line-height: 1.7; margin: 0 0 25px 0; font-weight: 500;">
      ${name ? `Hi ${name},` : 'Hello there,'}
    </p>
  `;
};

/**
 * Create paragraph
 */
const createParagraph = (text) => {
  return `
    <p style="color: ${BRAND_COLORS.text}; font-size: 16px; line-height: 1.8; margin: 0 0 40px 0;">
      ${text}
    </p>
  `;
};

/**
 * Create features list
 */
const createFeaturesList = (features) => {
  const items = features.map(feature => `
    <tr>
      <td style="padding: 12px 0; ${feature !== features[features.length - 1] ? `border-bottom: 1px solid ${BRAND_COLORS.primary}10;` : ''}">
        <span style="color: ${BRAND_COLORS.primary}; font-size: 20px; margin-right: 12px;">${feature.icon}</span>
        <span style="color: ${BRAND_COLORS.text}; font-size: 16px; line-height: 1.6;">${feature.text}</span>
      </td>
    </tr>
  `).join('');

  return `
    <div style="margin: 45px 0;">
      <h3 style="color: ${BRAND_COLORS.primary}; font-size: 22px; font-weight: 600; margin: 0 0 25px 0; text-align: center;">
        What You Can Do
      </h3>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        ${items}
      </table>
    </div>
  `;
};

/**
 * Create security note
 */
const createSecurityNote = (minutes = 10) => {
  return `
    <p style="color: ${BRAND_COLORS.textLight}; font-size: 14px; line-height: 1.7; margin: 35px 0 0 0; text-align: center; padding-top: 30px; border-top: 1px solid ${BRAND_COLORS.primary}10;">
      <span style="color: ${BRAND_COLORS.primary}; font-weight: 500;">⏰ Security Note:</span> This link expires in <strong style="color: ${BRAND_COLORS.primary};">${minutes} minutes</strong> for your security.
    </p>
  `;
};

/**
 * Create info box
 */
const createInfoBox = (items) => {
  const itemsHtml = items.map(item => `
    <tr>
      <td style="padding: 8px 0; text-align: left;">
        <span style="color: ${BRAND_COLORS.primary}; font-size: 14px; margin-right: 10px;">•</span>
        <span style="color: ${BRAND_COLORS.text}; font-size: 14px; line-height: 1.7;">${item}</span>
      </td>
    </tr>
  `).join('');

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 40px 0;">
      <tr>
        <td style="padding: 20px 0; border-top: 1px solid ${BRAND_COLORS.primary}20; border-bottom: 1px solid ${BRAND_COLORS.primary}20;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            ${itemsHtml}
          </table>
        </td>
      </tr>
    </table>
  `;
};

/**
 * Create data table
 */
const createDataTable = (data) => {
  const rows = data.map((item, index) => `
    <tr>
      <td style="padding: 15px 0; ${index !== data.length - 1 ? `border-bottom: 1px solid ${BRAND_COLORS.primary}10;` : ''}">
        <span style="color: ${BRAND_COLORS.primary}; font-weight: 600; font-size: 15px; margin-right: 10px;">${item.label}:</span>
        <span style="color: ${BRAND_COLORS.text}; font-size: 16px;">${item.value}</span>
      </td>
    </tr>
  `).join('');

  return `
    <div style="margin: 40px 0;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        ${rows}
      </table>
    </div>
  `;
};

module.exports = {
  createEmailButton,
  createEmailWrapper,
  createHeader,
  createGreeting,
  createParagraph,
  createFeaturesList,
  createSecurityNote,
  createInfoBox,
  createDataTable,
};

