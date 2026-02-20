"""
OCR Service using Azure Document Intelligence
Extracts text and bounding boxes from document images.
"""

from azure.ai.formrecognizer import DocumentAnalysisClient
from azure.core.credentials import AzureKeyCredential
from typing import List, Dict, Optional
import logging
import os

logger = logging.getLogger(__name__)


class AzureOCRService:
    """Service for OCR using Azure Document Intelligence."""

    def __init__(self, endpoint: str, key: str):
        """
        Initialize Azure OCR service.

        Args:
            endpoint: Azure Document Intelligence endpoint URL
            key: Azure API key
        """
        if not endpoint or not key:
            raise ValueError("Azure endpoint and key must be provided")

        self.client = DocumentAnalysisClient(
            endpoint=endpoint,
            credential=AzureKeyCredential(key)
        )
        logger.info("Azure OCR Service initialized")

    async def analyze_document(self, image_path: str) -> Dict:
        """
        Analyze document image and extract text with bounding boxes.

        Args:
            image_path: Path to image file to analyze

        Returns:
            Dictionary containing:
            - text: Full extracted text
            - words: List of word objects with text, bounding_box, and confidence
            - lines: List of line objects with text and bounding_box
            - pages: Page-level information

        Raises:
            FileNotFoundError: If image file doesn't exist
            Exception: For OCR processing errors
        """
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image file not found: {image_path}")

        try:
            logger.info(f"Starting OCR analysis for: {image_path}")

            # Read image file
            with open(image_path, "rb") as f:
                image_data = f.read()

            # Analyze document using "prebuilt-read" model
            poller = self.client.begin_analyze_document(
                "prebuilt-read",
                document=image_data
            )

            result = poller.result()

            # Extract text and structure
            full_text = ""
            words = []
            lines = []
            pages_info = []

            for page in result.pages:
                pages_info.append({
                    'page_number': page.page_number,
                    'width': page.width,
                    'height': page.height,
                    'unit': page.unit,
                    'angle': page.angle if hasattr(page, 'angle') else 0
                })

                # Extract words with bounding boxes
                if hasattr(page, 'words') and page.words:
                    for word in page.words:
                        # Convert polygon to normalized bounding box [x, y, width, height] in 0-1 range
                        bbox = self._polygon_to_bbox(word.polygon, page.width, page.height)

                        words.append({
                            'text': word.content,
                            'bounding_box': bbox,
                            'confidence': word.confidence if hasattr(word, 'confidence') else 1.0,
                            'page_number': page.page_number
                        })

                # Extract lines with bounding boxes
                if hasattr(page, 'lines') and page.lines:
                    for line in page.lines:
                        bbox = self._polygon_to_bbox(line.polygon, page.width, page.height)

                        lines.append({
                            'text': line.content,
                            'bounding_box': bbox,
                            'page_number': page.page_number
                        })

                        full_text += line.content + "\n"

            logger.info(f"OCR complete: {len(words)} words, {len(lines)} lines extracted")

            return {
                'text': full_text.strip(),
                'words': words,
                'lines': lines,
                'pages': pages_info
            }

        except Exception as e:
            logger.error(f"Error during OCR analysis: {str(e)}")
            raise Exception(f"OCR analysis failed: {str(e)}")

    def _polygon_to_bbox(self, polygon: List, page_width: float, page_height: float) -> List[float]:
        """
        Convert polygon points to a normalized bounding box (0-1 range).

        Normalizing to 0-1 avoids ambiguity between inch and pixel coordinate
        systems returned by Azure DI depending on input type and DPI metadata.

        Args:
            polygon: List of points defining polygon
            page_width: Page width in the Azure DI unit (inch or pixel)
            page_height: Page height in the Azure DI unit

        Returns:
            Bounding box as [x, y, width, height] all in 0-1 range
        """
        if not polygon or len(polygon) < 4:
            return [0, 0, 0, 0]

        if not page_width or not page_height:
            return [0, 0, 0, 0]

        # Extract x and y coordinates
        x_coords = [point.x for point in polygon]
        y_coords = [point.y for point in polygon]

        # Calculate bounding box in original units
        x_min = min(x_coords)
        y_min = min(y_coords)
        x_max = max(x_coords)
        y_max = max(y_coords)

        width = x_max - x_min
        height = y_max - y_min

        # Normalize to 0-1 range
        return [
            x_min / page_width,
            y_min / page_height,
            width / page_width,
            height / page_height,
        ]

    def extract_text_only(self, image_path: str) -> str:
        """
        Extract only text content without bounding boxes (synchronous).

        Args:
            image_path: Path to image file

        Returns:
            Extracted text as string
        """
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image file not found: {image_path}")

        try:
            with open(image_path, "rb") as f:
                image_data = f.read()

            poller = self.client.begin_analyze_document(
                "prebuilt-read",
                document=image_data
            )

            result = poller.result()

            # Extract text from all pages
            text_content = ""
            for page in result.pages:
                if hasattr(page, 'lines') and page.lines:
                    for line in page.lines:
                        text_content += line.content + "\n"

            return text_content.strip()

        except Exception as e:
            logger.error(f"Error extracting text: {str(e)}")
            raise Exception(f"Text extraction failed: {str(e)}")
