import puppeteer from "puppeteer-core";
import { performance } from "perf_hooks";

    const generate_pdfReport= async function (req, res) {
        const startTime = performance.now();
        try {
            const htmlContent = req.body;
            if (!htmlContent) {
                return res.status(400).json({ error: "HTML content is required in the request body." });
            }

            // Remove specific classes/styles if necessary
            const updatedHtml = htmlContent.replace(
                /\.h-screen\s*{[\s\S]*?}/g,
                "/* $& */"
            ).replace(
                /\.overflow-y-auto\s*{[\s\S]*?}/g,
                "/* $& */"
            );
            // Ensure the environment variable is set
            process.env.LD_LIBRARY_PATH = "/opt/app-root/src/extracted/libs/lib64";
            // Set standalone executable path
            console.log("🚀 Launching browser...");
            console.log("📌 Current LD_LIBRARY_PATH:", process.env.LD_LIBRARY_PATH || "Not Set");
            console.log("🛠 Using Chromium from:", process.env.PLAYWRIGHT_EXECUTABLE_PATH || "Default Playwright path");
            // Launch Puppeteer with optimized arguments for OpenShift
            const browser = await puppeteer.launch({
                executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, // Use env var if set
                //executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ||'/app/firefox/firefox',
                headless: true,
                // dumpio: true,  // ✅ Enable detailed logs
                args: [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-crash-reporter",
                    "--disable-gpu",
                    "--disable-dev-shm-usage",
                    "--disable-software-rasterizer",
                    "--remote-debugging-port=9222",
                    "--disable-extensions",
                    "--disable-background-networking",
                    "--disable-sync",
                    "--disable-default-apps",
                    "--no-first-run",
                    "--no-zygote",
                    "--single-process",
                    "--disable-features=site-per-process",
                    "--user-data-dir=/tmp/chrome-user-data", // Ensures Chrome can write
                    "--crash-dumps-dir=/tmp/crash-dumps", // Prevents database error
                ],
                env: {
                    HOME: "/tmp", // Sets a writable home directory
                    ...process.env,  // Inherit existing env variables
                    LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH || undefined,
                    FC_CONFIG_FILE: process.env.FC_CONFIG_FILE || undefined,
                    FC_CONFIG_DIR: process.env.FC_CONFIG_DIR || undefined,
                    FC_FONT_PATH: process.env.FC_FONT_PATH || undefined
                }
            });

            console.log("🚀 Puppeteer launched successfully!");

            const page = await browser.newPage();
            await page.emulateMediaType("screen");

            // ✅ Add delay before setting content (optional)
            // await new Promise(resolve => setTimeout(resolve, 3000));

            await page.setContent(updatedHtml, { waitUntil: "networkidle2" });

            // Inject custom CSS for layout adjustments
            await page.addStyleTag({
                content: `
                @media screen {
                    body {
                        margin: 0;
                        padding: 0;
                        height: auto; /* Let content determine the height */
                        overflow: visible; /* Allow content to expand as needed */
                        background-color: white !important;
                        -webkit-print-color-adjust: exact; /* Ensure accurate colors in print */
                    }
                }
            `,
            });
            // Generate the PDF
            const pdfBuffer = await page.pdf({
                format: "A4",
                printBackground: true,
                scale: 0.5,
                margin: {
                    top: "10mm",
                    bottom: "10mm",
                    left: "10mm",
                    right: "10mm",
                },
                displayHeaderFooter: true,
                headerTemplate: "<div></div>",
                footerTemplate: `
                    <div style="font-size: 10px; text-align: center; width: 100%; padding-top: 10px;">
                        Page <span class="pageNumber"></span> of <span class="totalPages"></span>
                    </div>
                `,
            });

            await browser.close();
            console.log("✅ PDF generated successfully!");

            // Calculate time taken
            const endTime = performance.now();
            const timeTaken = ((endTime - startTime) / 1000).toFixed(2);

            // Send the PDF as a response without saving to disk
            res.set({
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="report.pdf"',
            });
            res.send(pdfBuffer);
            console.log(`📄 PDF response sent successfully. Time taken: ${timeTaken} seconds`);
        } catch (error) {
            console.error("❌ Error generating PDF:", error);
            res.status(500).json({ error: "Failed to generate PDF", details: error.message });
        }
    };
export default {generate_pdfReport};
