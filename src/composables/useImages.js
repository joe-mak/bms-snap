import { ref } from 'vue'

export function useImages() {
  const taskImages = ref([])

  async function compressImage(base64String, maxWidth = 800, quality = 0.7) {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height

        if (width > maxWidth) {
          height = (height * maxWidth) / width
          width = maxWidth
        }

        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        const isPng = base64String.startsWith('data:image/png')
        if (!isPng) {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, width, height)
        }
        ctx.drawImage(img, 0, 0, width, height)

        resolve(isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = () => resolve(base64String)
      img.src = base64String
    })
  }

  async function processTaskImage(file) {
    if (file.size > 2 * 1024 * 1024) {
      return { success: false, message: 'ขนาดไฟล์ต้องไม่เกิน 2MB' }
    }

    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = async (e) => {
        const imageData = e.target.result
        const compressedImage = await compressImage(imageData, 800, 0.7)
        const imageId = Date.now() + Math.random().toString(36).substr(2, 9)
        taskImages.value.push({ id: imageId, data: compressedImage })
        resolve({ success: true, message: 'เพิ่มรูปภาพแล้ว' })
      }
      reader.onerror = () => resolve({ success: false, message: 'ไม่สามารถอ่านไฟล์ได้' })
      reader.readAsDataURL(file)
    })
  }

  function removeTaskImage(imageId) {
    taskImages.value = taskImages.value.filter(img => img.id !== imageId)
  }

  function clearTaskImages() {
    taskImages.value = []
  }

  async function copyImageToClipboard(imageId) {
    const image = taskImages.value.find(img => img.id === imageId)
    if (!image) {
      return { success: false, message: 'ไม่พบรูปภาพ' }
    }

    try {
      const blob = await convertImageToBlob(image.data)
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ])
      return { success: true, message: 'คัดลอกรูปภาพแล้ว ✓' }
    } catch (err) {
      console.error('Copy image failed:', err)
      return { success: false, message: 'ไม่สามารถคัดลอกอัตโนมัติได้' }
    }
  }

  function convertImageToBlob(imageData) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Failed to convert image to blob'))
          }
        }, 'image/png')
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = imageData
    })
  }

  async function handleProfileImage(file, maxWidth = 400, quality = 0.8) {
    if (file.size > 2 * 1024 * 1024) {
      return { success: false, message: 'ขนาดไฟล์ต้องไม่เกิน 2MB' }
    }

    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = async (e) => {
        const imageData = e.target.result
        const compressedImage = await compressImage(imageData, maxWidth, quality)
        resolve({ success: true, data: compressedImage })
      }
      reader.onerror = () => resolve({ success: false, message: 'ไม่สามารถอ่านไฟล์ได้' })
      reader.readAsDataURL(file)
    })
  }

  return {
    taskImages,
    compressImage,
    processTaskImage,
    removeTaskImage,
    clearTaskImages,
    copyImageToClipboard,
    convertImageToBlob,
    handleProfileImage
  }
}
