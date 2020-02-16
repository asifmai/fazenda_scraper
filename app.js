const pupHelper = require('./puppeteerhelper');
const axios = require('axios');
const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./config');

(async () => {
  // Goto the main page
  const browser = await pupHelper.launchBrowser();
  const page = await pupHelper.launchPage(browser);
  await page.goto(`${config.siteLink}/SimplesNacional/aplicacoes.aspx?id=21`, {timeout: 0, waitUntil: 'load'});

  // Goto iframe Page
  await page.waitForSelector('iframe#frame');
  const internalUrl = await pupHelper.getAttr('iframe#frame', 'src', page);
  await page.goto(`${config.siteLink}${internalUrl}`, {timeout: 0, waitUntil: 'load'});

  // Get the recaptcha Image
  await page.waitForSelector('img#img-captcha2', {timeout: 0});
  const imgBase64 = await pupHelper.getAttr('img#img-captcha2', 'src', page);

  // Send recaptcha Image to 2captcha for solving
  const captchaResp = await axios.post(config.captchaUrl, {
    method: "base64",
    key: config.captchaKey,
    body: imgBase64,
    json: 1,
  });
  const captchaId = captchaResp.data.request;
  console.log(`Request Send to 2captcha, ID: ${captchaId}`);

  // Request recaptcha Solution from 2captcha
  let captchaResp2;
  do {
    await page.waitFor(5000);
    const url = `${config.captchaRespUrl}${config.captchaKey}&id=${captchaId}`;
    captchaResp2 = await axios.get(url);
  } while (captchaResp2.data.request == 'CAPCHA_NOT_READY');

  const captchaSolution = captchaResp2.data.request;
  console.log(`Captcha Solution: ${captchaSolution}`);

  // Put in the captcha solution and CNPJ on form and submit
  await page.focus('input.caixaTexto');
  await page.keyboard.type(config.cnpj);
  await page.focus('input[maxlength="6"]');
  await page.keyboard.type(captchaSolution);
  await Promise.all([
    page.waitForNavigation({timeout:0, waitUntil: 'load'}),
    page.click('input[type="submit"]'),
  ]);

  // Download PDF
  const pdfPath = path.resolve(__dirname, `pdfs/${config.cnpj}`);
  await page._client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: pdfPath,
  });
  
  await page.waitForSelector('input[value="Gerar PDF"]');
  await page.click('input[value="Gerar PDF"]');
  await page.waitFor(5000);
  await browser.close();

  // Check if pdf downloaded
  if (fs.existsSync(pdfPath)) {
    console.log(`PDF downloaded to ${pdfPath}`);
    const reportGoodUrl = `${config.captchaReportGood}${config.captchaKey}&id=${captchaId}`;
    await axios.get(reportGoodUrl);
    return true;
  } else {
    console.log(`PDF could not be downloaded`);
    const reportBadUrl = `${config.captchaReportBad}${config.captchaKey}&id=${captchaId}`;
    await axios.get(reportBadUrl);
    return false;
  }
})()