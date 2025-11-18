# GlobalApplicationMenusMainWindow.py
# Generated from c:\Users\pho\repos\pyPhoPlaceCellAnalysis\src\pyphoplacecellanalysis\GUI\Qt\GlobalApplicationMenus\GlobalApplicationMenusMainWindow.ui automatically by PhoPyQtClassGenerator VSCode Extension
import os
import pyphoplacecellanalysis.External.pyqtgraph as pg
from pyphoplacecellanalysis.External.pyqtgraph.Qt import QtCore, QtGui, QtWidgets, mkQApp, uic

## IMPORTS:
# from ...pyPhoPlaceCellAnalysis.src.pyphoplacecellanalysis.GUI.Qt.GlobalApplicationMenus import GlobalApplicationMenusMainWindow
# from pyphoplacecellanalysis.Resources import ActionIcons
# from pyphoplacecellanalysis.Resources import GuiResources
from pyphoplacecellanalysis.Resources import GuiResources, ActionIcons
from pyphoplacecellanalysis.GUI.Qt.Menus.GlobalApplicationMenusMainWindow.Uic_AUTOGEN_GlobalApplicationMenusMainWindow import Ui_GlobalApplicationMenusMainWindow

# .Uic_AUTOGEN_FigureFormatConfigControls import Ui_Form



## Define main window class from template
# path = os.path.dirname(os.path.abspath(__file__))
# uiFile = os.path.join(path, 'GlobalApplicationMenusMainWindow.ui')
# WindowTemplate, TemplateBaseClass = pg.Qt.loadUiType(uiFile)


# class GlobalApplicationMenusMainWindow(TemplateBaseClass):
# 	def __init__(self, parent=None):
# 		TemplateBaseClass.__init__(self, parent=parent) # Call the inherited classes __init__ method
# 		# Create the main window
# 		# self.ui = WindowTemplate()
# 		# self.ui.setupUi(self)
# 		self.ui = uic.loadUi(uiFile, self) # Load the .ui file
		
# 		self.initUI()
# 		self.show() # Show the GUI


# 	def initUI(self):
# 		pass


# 	def __str__(self):
# 		return 


class GlobalApplicationMenusMainWindow(QtWidgets.QMainWindow):
# class GlobalApplicationMenusMainWindow(QtWidgets.QWidget):
	def __init__(self, parent=None):
		super().__init__(parent=parent) # Call the inherited classes __init__ method
		# self.ui = uic.loadUi("../pyPhoPlaceCellAnalysis/src/pyphoplacecellanalysis/GUI/Qt/GlobalApplicationMenus/GlobalApplicationMenusMainWindow.ui", self) # Load the .ui file
		# self.ui = uic.loadUi(uiFile, self) # Load the .ui file

		# AUTOGEN version:
		self.ui = Ui_GlobalApplicationMenusMainWindow()
		self.ui.setupUi(self) # builds the design from the .ui onto this widget.

		self.initUI()
		self.show() # Show the GUI


	def initUI(self):
		pass




## Start Qt event loop
if __name__ == '__main__':
    app = mkQApp("GlobalApplicationMenusMainWindow Example")
    widget = GlobalApplicationMenusMainWindow()
    widget.show()
    pg.exec()
