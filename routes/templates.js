const express = require("express");
const router = express.Router();
const JournalTemplate = require("../models/JournalTemplate");
const Journal = require("../models/Journal");
const { requireAuth } = require("../middlewares/auth");
const { requireAdminAuth } = require("../middlewares/adminAuth");
const multer = require("multer");
const cloudinary = require("../config/cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");

// Configure multer for Cloudinary uploads
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "everquill/templates",
    allowed_formats: ["jpg", "jpeg", "png", "gif"],
    transformation: [
      { width: 800, height: 600, crop: "fill" },
      { quality: "auto" },
    ],
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    // Accept only image files
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"), false);
    }
  },
});

/**
 * @openapi
 * /api/templates:
 *   get:
 *     summary: "Get available journal templates (Free & Premium)"
 *     tags: [Templates]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Templates retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     defaultTemplates:
 *                       type: array
 *                     premiumTemplates:
 *                       type: array
 *                     userTemplates:
 *                       type: array
 *                     userPlan:
 *                       type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const user = req.user;

    // Get available templates based on user plan
    const templates = await JournalTemplate.getAvailableTemplates(
      user.plan,
      user.id
    );

    // Separate templates by category
    const defaultTemplates = templates.filter((t) => t.category === "default");
    const premiumTemplates = templates.filter((t) => t.category === "premium");
    const userTemplates = templates.filter((t) => t.category === "user");

    res.json({
      success: true,
      data: {
        defaultTemplates,
        premiumTemplates,
        userTemplates,
        userPlan: user.plan,
        totalTemplates: templates.length,
      },
    });
  } catch (error) {
    console.error("Error getting templates:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving templates",
      error: error.message,
    });
  }
});

/**
 * @openapi
 * /api/templates/upload:
 *   post:
 *     summary: "Upload custom template (Premium only)"
 *     tags: [Templates]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "My Custom Template"
 *               description:
 *                 type: string
 *                 example: "A beautiful custom template"
 *               template:
 *                 type: string
 *                 format: binary
 *                 description: "Template image file"
 *     responses:
 *       201:
 *         description: Template uploaded successfully
 *       403:
 *         description: Premium access required
 *       500:
 *         description: Server error
 */
router.post(
  "/upload",
  requireAuth,
  upload.single("template"),
  async (req, res) => {
    try {
      // Check if user has premium
      if (req.user.plan !== "premium") {
        return res.status(403).json({
          success: false,
          message: "Premium subscription required to upload custom templates",
        });
      }

      const { name, description } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Name is required",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Template image is required",
        });
      }

      // Create thumbnail (in real app, you'd use image processing library)
      const thumbnailUrl = req.file.path; // Same as main image for now

      const template = new JournalTemplate({
        name: name.trim(),
        description,
        category: "user",
        imageUrl: req.file.path,
        thumbnailUrl: thumbnailUrl,
        uploadedBy: req.user.id,
        tags: ["custom", "user-uploaded"],
      });

      await template.save();

      res.status(201).json({
        success: true,
        message: "Template uploaded successfully",
        data: {
          template: {
            id: template._id,
            name: template.name,
            description: template.description,
            imageUrl: template.imageUrl,
            thumbnailUrl: template.thumbnailUrl,
            category: template.category,
            uploadedBy: template.uploadedBy,
            tags: template.tags,
          },
        },
      });
    } catch (error) {
      console.error("Error uploading template:", error);

      // Clean up uploaded file if template creation failed
      if (req.file && req.file.path) {
        try {
          const imagePublicId = req.file.public_id || req.file.filename;
          if (imagePublicId) {
            await cloudinary.uploader.destroy(imagePublicId);
          }
        } catch (cleanupError) {
          console.error(
            "Error cleaning up uploaded template on Cloudinary:",
            cleanupError
          );
        }
      }

      res.status(500).json({
        success: false,
        message: "Error uploading template",
        error: error.message,
      });
    }
  }
);

/**
 * @openapi
 * /api/templates/{templateId}/use:
 *   post:
 *     summary: "Use template for journal entry"
 *     tags: [Templates]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               journalId:
 *                 type: string
 *                 description: "Journal ID to apply template to"
 *     responses:
 *       200:
 *         description: Template applied successfully
 *       403:
 *         description: Access denied
 *       404:
 *         description: Template or journal not found
 *       500:
 *         description: Server error
 */
router.post("/:templateId/use", requireAuth, async (req, res) => {
  try {
    const { templateId } = req.params;
    const { journalId } = req.body;

    // Check if template exists and user has access
    const template = await JournalTemplate.findById(templateId);
    if (!template) {
      return res.status(404).json({
        success: false,
        message: "Template not found",
      });
    }

    // Check access permissions
    if (template.category === "premium" && req.user.plan !== "premium") {
      return res.status(403).json({
        success: false,
        message: "Premium subscription required for this template",
      });
    }

    if (
      template.category === "user" &&
      template.uploadedBy.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "You can only use your own custom templates",
      });
    }

    // Apply template to journal
    const journal = await Journal.findOneAndUpdate(
      { _id: journalId, userId: req.user.id },
      {
        templateId: template._id,
        templateName: template.name,
      },
      { new: true }
    );

    if (!journal) {
      return res.status(404).json({
        success: false,
        message: "Journal not found",
      });
    }

    // Increment template usage
    await JournalTemplate.incrementUsage(templateId);

    res.json({
      success: true,
      message: "Template applied successfully",
      data: {
        journal: {
          id: journal._id,
          title: journal.title,
          templateId: journal.templateId,
          templateName: journal.templateName,
        },
        template: {
          id: template._id,
          name: template.name,
          imageUrl: template.imageUrl,
        },
      },
    });
  } catch (error) {
    console.error("Error using template:", error);
    res.status(500).json({
      success: false,
      message: "Error applying template",
      error: error.message,
    });
  }
});

/**
 * @openapi
 * /api/templates/{templateId}:
 *   delete:
 *     summary: "Delete user's custom template"
 *     tags: [Templates]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Template deleted successfully
 *       403:
 *         description: Access denied
 *       404:
 *         description: Template not found
 *       500:
 *         description: Server error
 */
router.delete("/:templateId", requireAuth, async (req, res) => {
  try {
    const { templateId } = req.params;

    const template = await JournalTemplate.findById(templateId);
    if (!template) {
      return res.status(404).json({
        success: false,
        message: "Template not found",
      });
    }

    // Only allow users to delete their own templates
    if (
      template.category !== "user" ||
      template.uploadedBy.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own custom templates",
      });
    }

    // Delete template file from Cloudinary
    try {
      if (template.imageUrl && template.imageUrl.includes("cloudinary.com")) {
        // Extract public_id from Cloudinary URL
        const urlParts = template.imageUrl.split("/");
        const publicId = urlParts[urlParts.length - 1].split(".")[0];
        const folder = "everquill/templates";
        const fullPublicId = `${folder}/${publicId}`;

        await cloudinary.uploader.destroy(fullPublicId);
      }
    } catch (fileError) {
      console.error("Error deleting template file from Cloudinary:", fileError);
    }

    await JournalTemplate.findByIdAndDelete(templateId);

    res.json({
      success: true,
      message: "Template deleted successfully",
      data: {
        deletedTemplate: {
          id: template._id,
          name: template.name,
        },
      },
    });
  } catch (error) {
    console.error("Error deleting template:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting template",
      error: error.message,
    });
  }
});

// Admin routes for template management
/**
 * @openapi
 * /api/templates/admin:
 *   post:
 *     summary: "Upload admin template (Admin only)"
 *     tags: [Admin Templates]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Premium Floral Template"
 *               description:
 *                 type: string
 *                 example: "Beautiful floral design"
 *               category:
 *                 type: string
 *                 enum: [default, premium]
 *                 example: "premium"
 *               template:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Admin template uploaded successfully
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.post(
  "/admin",
  requireAdminAuth,
  upload.single("template"),
  async (req, res) => {
    try {
      const { name, description, category } = req.body;

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Template image is required",
        });
      }

      if (!["default", "premium"].includes(category)) {
        return res.status(400).json({
          success: false,
          message: "Category must be 'default' or 'premium'",
        });
      }

      const template = new JournalTemplate({
        name,
        description,
        category,
        imageUrl: req.file.path,
        thumbnailUrl: req.file.path, // Same as main image for now
        uploadedBy: null, // Admin uploaded
        tags: ["admin-uploaded", category],
      });

      await template.save();

      res.status(201).json({
        success: true,
        message: "Admin template uploaded successfully",
        data: {
          template: {
            id: template._id,
            name: template.name,
            description: template.description,
            category: template.category,
            imageUrl: template.imageUrl,
          },
        },
      });
    } catch (error) {
      console.error("Error uploading admin template:", error);

      // Clean up uploaded file if template creation failed
      if (req.file && req.file.path) {
        try {
          const imagePublicId = req.file.public_id || req.file.filename;
          if (imagePublicId) {
            await cloudinary.uploader.destroy(imagePublicId);
          }
        } catch (cleanupError) {
          console.error(
            "Error cleaning up uploaded admin template on Cloudinary:",
            cleanupError
          );
        }
      }

      res.status(500).json({
        success: false,
        message: "Error uploading admin template",
        error: error.message,
      });
    }
  }
);

/**
 * @openapi
 * /api/templates/admin:
 *   get:
 *     summary: "Get all templates (Admin only)"
 *     tags: [Admin Templates]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: All templates retrieved successfully
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.get("/admin", requireAdminAuth, async (req, res) => {
  try {
    const templates = await JournalTemplate.find({})
      .populate("uploadedBy", "name email")
      .sort({ category: 1, createdAt: -1 });

    const stats = {
      total: templates.length,
      default: templates.filter((t) => t.category === "default").length,
      premium: templates.filter((t) => t.category === "premium").length,
      user: templates.filter((t) => t.category === "user").length,
    };

    res.json({
      success: true,
      data: {
        templates,
        statistics: stats,
      },
    });
  } catch (error) {
    console.error("Error getting admin templates:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving templates",
      error: error.message,
    });
  }
});

/**
 * @openapi
 * /api/templates/admin/{templateId}:
 *   delete:
 *     summary: "Delete system templates only (Admin only)"
 *     description: "Admin can only delete default and premium templates, not user-uploaded templates"
 *     tags: [Admin Templates]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema:
 *           type: string
 *           description: Template ID to delete (must be default or premium category)
 *     responses:
 *       200:
 *         description: System template deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     deletedTemplate:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         category:
 *                           type: string
 *                           enum: [default, premium]
 *                         usageCount:
 *                           type: number
 *       400:
 *         description: Template is being used by journals
 *       403:
 *         description: Admin access required or trying to delete user template
 *       404:
 *         description: Template not found
 *       500:
 *         description: Server error
 */
router.delete("/admin/:templateId", requireAdminAuth, async (req, res) => {
  try {
    const { templateId } = req.params;

    // Find template
    const template = await JournalTemplate.findById(templateId);
    if (!template) {
      return res.status(404).json({
        success: false,
        message: "Template not found",
      });
    }

    // Admin can only delete system templates (default, premium), not user templates
    if (template.category === "user") {
      return res.status(403).json({
        success: false,
        message:
          "Admin cannot delete user-uploaded templates. Use toggle-status to deactivate instead.",
        data: {
          templateId: template._id,
          templateName: template.name,
          category: template.category,
          suggestion:
            "Use PATCH /api/templates/admin/:templateId/toggle-status to deactivate",
        },
      });
    }

    // Check if template is being used by any journals
    const journalsUsingTemplate = await Journal.countDocuments({
      templateId: templateId,
    });

    if (journalsUsingTemplate > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete template. It is currently being used by ${journalsUsingTemplate} journal(s). Please reassign those journals to other templates first.`,
        data: {
          usageCount: journalsUsingTemplate,
        },
      });
    }

    // Delete template file from Cloudinary
    try {
      if (template.imageUrl && template.imageUrl.includes("cloudinary.com")) {
        // Extract public_id from Cloudinary URL
        const urlParts = template.imageUrl.split("/");
        const publicId = urlParts[urlParts.length - 1].split(".")[0];
        const folder = "everquill/templates";
        const fullPublicId = `${folder}/${publicId}`;

        await cloudinary.uploader.destroy(fullPublicId);
      }
      // Also delete thumbnail if it's different from main image
      if (
        template.thumbnailUrl &&
        template.thumbnailUrl !== template.imageUrl &&
        template.thumbnailUrl.includes("cloudinary.com")
      ) {
        const urlParts = template.thumbnailUrl.split("/");
        const publicId = urlParts[urlParts.length - 1].split(".")[0];
        const folder = "everquill/templates";
        const fullPublicId = `${folder}/${publicId}`;

        await cloudinary.uploader.destroy(fullPublicId);
      }
    } catch (fileError) {
      console.error(
        "Error deleting template files from Cloudinary:",
        fileError
      );
      // Continue with database deletion even if file deletion fails
    }

    // Delete template from database
    await JournalTemplate.findByIdAndDelete(templateId);

    res.json({
      success: true,
      message: "System template deleted successfully",
      data: {
        deletedTemplate: {
          id: template._id,
          name: template.name,
          category: template.category,
          usageCount: template.usageCount,
          uploadedBy: template.uploadedBy,
        },
      },
    });
  } catch (error) {
    console.error("Error deleting template:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting template",
      error: error.message,
    });
  }
});

/**
 * @openapi
 * /api/templates/admin/{templateId}/toggle-status:
 *   patch:
 *     summary: "Toggle template active status (Admin only)"
 *     description: "Admin can activate/deactivate any template including user-uploaded ones"
 *     tags: [Admin Templates]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema:
 *           type: string
 *           description: Template ID to toggle (any category)
 *     responses:
 *       200:
 *         description: Template status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     template:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         category:
 *                           type: string
 *                           enum: [default, premium, user]
 *                         isActive:
 *                           type: boolean
 *                     newStatus:
 *                       type: boolean
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Template not found
 *       500:
 *         description: Server error
 */
router.patch(
  "/admin/:templateId/toggle-status",
  requireAdminAuth,
  async (req, res) => {
    try {
      const { templateId } = req.params;

      const template = await JournalTemplate.findById(templateId);
      if (!template) {
        return res.status(404).json({
          success: false,
          message: "Template not found",
        });
      }

      // Toggle active status
      template.isActive = !template.isActive;
      await template.save();

      res.json({
        success: true,
        message: `Template ${
          template.isActive ? "activated" : "deactivated"
        } successfully`,
        data: {
          template: {
            id: template._id,
            name: template.name,
            category: template.category,
            isActive: template.isActive,
          },
          newStatus: template.isActive,
        },
      });
    } catch (error) {
      console.error("Error toggling template status:", error);
      res.status(500).json({
        success: false,
        message: "Error updating template status",
        error: error.message,
      });
    }
  }
);

module.exports = router;
