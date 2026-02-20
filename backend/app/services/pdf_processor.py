"""
PDF Processing Service
Handles conversion between PDF and image formats for document processing.
"""

from pdf2image import convert_from_path
from PIL import Image
import img2pdf
import os
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class PDFProcessor:
    """Service for PDF to image and image to PDF conversions."""

    def __init__(self, dpi: int = 300):
        """
        Initialize PDF processor.

        Args:
            dpi: Resolution for PDF to image conversion (default 300)
        """
        self.dpi = dpi

    def pdf_to_image(
        self,
        pdf_path: str,
        output_path: str,
        page_number: int = 1
    ) -> str:
        """
        Convert specified page of PDF to high-resolution image.

        Args:
            pdf_path: Path to input PDF file
            output_path: Path for output image file
            page_number: Page number to convert (1-indexed, default 1)

        Returns:
            Path to the generated image file

        Raises:
            FileNotFoundError: If PDF file doesn't exist
            ValueError: If page number is invalid
            Exception: For PDF conversion errors
        """
        if not os.path.exists(pdf_path):
            raise FileNotFoundError(f"PDF file not found: {pdf_path}")

        try:
            logger.info(f"Converting PDF page {page_number} to image at {self.dpi} DPI")

            # Convert PDF to images (only first page for single-page PDFs)
            images = convert_from_path(
                pdf_path,
                dpi=self.dpi,
                first_page=page_number,
                last_page=page_number
            )

            if not images:
                raise ValueError(f"No pages found in PDF: {pdf_path}")

            # Save the first (and only) page
            image = images[0]
            image.save(output_path, 'PNG')

            logger.info(f"Successfully converted PDF to image: {output_path}")
            return output_path

        except Exception as e:
            logger.error(f"Error converting PDF to image: {str(e)}")
            raise Exception(f"Failed to convert PDF to image: {str(e)}")

    def image_to_pdf(
        self,
        image_path: str,
        output_path: str,
        compression: bool = True
    ) -> str:
        """
        Convert processed image back to PDF format.

        Args:
            image_path: Path to input image file
            output_path: Path for output PDF file
            compression: Whether to apply compression (default True)

        Returns:
            Path to the generated PDF file

        Raises:
            FileNotFoundError: If image file doesn't exist
            Exception: For PDF creation errors
        """
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image file not found: {image_path}")

        try:
            logger.info(f"Converting image to PDF: {image_path} -> {output_path}")

            # Open and validate image
            with Image.open(image_path) as img:
                # Convert RGBA to RGB if necessary
                if img.mode == 'RGBA':
                    # Create white background
                    rgb_img = Image.new('RGB', img.size, (255, 255, 255))
                    rgb_img.paste(img, mask=img.split()[3])  # Use alpha channel as mask

                    # Save as temporary RGB image
                    temp_path = image_path.replace('.png', '_rgb.png')
                    rgb_img.save(temp_path, 'PNG')
                    img_to_convert = temp_path
                else:
                    img_to_convert = image_path

            # Convert image to PDF
            with open(output_path, 'wb') as f:
                f.write(img2pdf.convert(img_to_convert))

            # Clean up temporary file if created
            if img_to_convert != image_path and os.path.exists(img_to_convert):
                os.remove(img_to_convert)

            logger.info(f"Successfully converted image to PDF: {output_path}")
            return output_path

        except Exception as e:
            logger.error(f"Error converting image to PDF: {str(e)}")
            raise Exception(f"Failed to convert image to PDF: {str(e)}")

    def get_pdf_info(self, pdf_path: str) -> dict:
        """
        Get information about a PDF file.

        Args:
            pdf_path: Path to PDF file

        Returns:
            Dictionary with PDF information (page count, dimensions, etc.)
        """
        if not os.path.exists(pdf_path):
            raise FileNotFoundError(f"PDF file not found: {pdf_path}")

        try:
            # Convert all pages at low res to count pages and get first-page dimensions
            images = convert_from_path(pdf_path, dpi=72)

            if not images:
                raise ValueError(f"Could not read PDF: {pdf_path}")

            image = images[0]

            return {
                'page_count': len(images),
                'width': image.width,
                'height': image.height,
                'size_bytes': os.path.getsize(pdf_path)
            }

        except Exception as e:
            logger.error(f"Error getting PDF info: {str(e)}")
            raise Exception(f"Failed to get PDF info: {str(e)}")

    def pdf_to_images_all(
        self,
        pdf_path: str,
        output_dir: str,
        session_id: str
    ) -> list:
        """
        Convert all pages of a PDF to high-resolution images.

        Args:
            pdf_path: Path to input PDF file
            output_dir: Directory to save image files
            session_id: Session ID used for naming files

        Returns:
            List of paths to generated image files (one per page, 1-indexed)

        Raises:
            FileNotFoundError: If PDF file doesn't exist
            Exception: For PDF conversion errors
        """
        if not os.path.exists(pdf_path):
            raise FileNotFoundError(f"PDF file not found: {pdf_path}")

        try:
            logger.info(f"Converting all PDF pages to images at {self.dpi} DPI")

            images = convert_from_path(pdf_path, dpi=self.dpi)

            if not images:
                raise ValueError(f"No pages found in PDF: {pdf_path}")

            image_paths = []
            for n, image in enumerate(images, 1):
                output_path = os.path.join(output_dir, f"{session_id}_page{n}.png")
                image.save(output_path, 'PNG')
                image_paths.append(output_path)
                logger.info(f"Saved page {n} to {output_path}")

            logger.info(f"Successfully converted {len(image_paths)} pages to images")
            return image_paths

        except Exception as e:
            logger.error(f"Error converting PDF to images: {str(e)}")
            raise Exception(f"Failed to convert PDF to images: {str(e)}")

    def images_to_pdf(
        self,
        image_paths: list,
        output_path: str
    ) -> str:
        """
        Convert a list of images into a single multi-page PDF.

        Args:
            image_paths: List of paths to input image files (one per page)
            output_path: Path for output PDF file

        Returns:
            Path to the generated PDF file

        Raises:
            FileNotFoundError: If any image file doesn't exist
            Exception: For PDF creation errors
        """
        if not image_paths:
            raise ValueError("No image paths provided")

        temp_paths = []
        try:
            logger.info(f"Converting {len(image_paths)} images to multi-page PDF")

            paths_to_convert = []
            for image_path in image_paths:
                if not os.path.exists(image_path):
                    raise FileNotFoundError(f"Image file not found: {image_path}")

                with Image.open(image_path) as img:
                    if img.mode == 'RGBA':
                        rgb_img = Image.new('RGB', img.size, (255, 255, 255))
                        rgb_img.paste(img, mask=img.split()[3])
                        temp_path = image_path.replace('.png', '_rgb.png')
                        rgb_img.save(temp_path, 'PNG')
                        temp_paths.append(temp_path)
                        paths_to_convert.append(temp_path)
                    else:
                        paths_to_convert.append(image_path)

            with open(output_path, 'wb') as f:
                f.write(img2pdf.convert(paths_to_convert))

            logger.info(f"Successfully created multi-page PDF: {output_path}")
            return output_path

        except Exception as e:
            logger.error(f"Error converting images to PDF: {str(e)}")
            raise Exception(f"Failed to convert images to PDF: {str(e)}")
        finally:
            for temp_path in temp_paths:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
